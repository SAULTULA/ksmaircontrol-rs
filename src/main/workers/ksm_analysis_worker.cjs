/**
 * ksm_analysis_worker.js
 * Worker Thread de Análisis de Audio para KSM AirControl.
 * 
 * Adaptado del audio_analysis_worker.js de LF-Automatizador 0.9.14.
 * Usa FFmpeg para calcular: Duración, dB medio, dB pico, mix_point (inicio del fade-out),
 * inicio_point (fin del silencio inicial) y fin_point (inicio del silencio final).
 * 
 * Estos datos se guardan en SQLite (library_db.js) y permiten crossfades precisos en el Player.
 */

'use strict';

const { parentPort, workerData } = require('worker_threads');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Resolver ruta de ffmpeg-static
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
} catch (e) {
  ffmpegPath = 'ffmpeg'; // fallback al PATH del sistema
}

const CPU_COUNT = Math.max(1, require('os').cpus()?.length || 2);
const MAX_CONCURRENT = Math.max(1, Math.min(4, CPU_COUNT));
let queue = [];
let active = 0;
let cancelled = false;

// === HELPERS FFmpeg ===
const runFfmpegCommand = (args) => new Promise((resolve, reject) => {
  const proc = cp.spawn(ffmpegPath, args, { windowsHide: true });
  let output = '';
  proc.stderr.on('data', (d) => { output += d.toString(); });
  proc.stdout.on('data', (d) => { output += d.toString(); });
  proc.on('error', reject);
  proc.on('close', () => resolve(output));
});

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

async function analyzeWithFFmpeg(filePath, { dbMix = -14, dbStart = -36, dbFin = -48 } = {}) {
  // 1. Detectar volumen y duración
  const volOutput = await runFfmpegCommand([
    '-hide_banner', '-nostats', '-threads', '1',
    '-i', filePath,
    '-af', 'volumedetect',
    '-f', 'null', '-'
  ]);

  const durationMatch = volOutput.match(/Duration:\s*([\d\:\.]+)/);
  if (!durationMatch) throw new Error('FFmpeg no pudo leer la duración del archivo: ' + filePath);

  const totalDur = timeToSeconds(durationMatch[1]);
  const meanMatch = volOutput.match(/mean_volume:\s*([\-\d\.]+)/);
  const maxMatch = volOutput.match(/max_volume:\s*([\-\d\.]+)/);

  const dbValue = meanMatch ? parseFloat(meanMatch[1]) : -14.0;
  const rawPeak = maxMatch ? parseFloat(maxMatch[1]) : dbValue;
  const peakDbValue = Math.min(rawPeak, 3.0);

  // 2. Detectar silencios para calcular inicio, mix y fin
  const runSilDetect = async (dbThreshold, dur) => {
    const out = await runFfmpegCommand([
      '-hide_banner', '-nostats', '-threads', '1',
      '-i', filePath,
      '-af', `silencedetect=n=${dbThreshold}dB:d=${dur}`,
      '-f', 'null', '-'
    ]);
    const blocks = [];
    let currentStart = null;
    for (const line of out.split('\n')) {
      const ms = line.match(/silence_start:\s*([\d\.]+)/);
      if (ms) currentStart = parseFloat(ms[1]);
      const me = line.match(/silence_end:\s*([\d\.]+)/);
      if (me) {
        blocks.push({ start: currentStart ?? 0, end: parseFloat(me[1]) });
        currentStart = null;
      }
    }
    if (currentStart !== null) blocks.push({ start: currentStart, end: totalDur });
    return blocks;
  };

  const mathPeak = Math.min(rawPeak, 0.0);
  const dynamicMix = (mathPeak + dbMix).toFixed(1);

  const [startSil, finSil, mixSil] = await Promise.all([
    runSilDetect(dbStart.toFixed(1), 0.4),
    runSilDetect(dbFin.toFixed(1), 0.4),
    runSilDetect(dynamicMix, 0.2)
  ]);

  // Inicio: fin del silencio de apertura
  let inicioPoint = 0.001;
  if (startSil.length > 0 && startSil[0].start <= 1.5) inicioPoint = startSil[0].end;

  // Fin: inicio del silencio de cierre
  let finPoint = totalDur;
  for (let i = finSil.length - 1; i >= 0; i--) {
    if (finSil[i].end >= totalDur - 0.5) { finPoint = finSil[i].start; break; }
  }

  // Mix: punto donde comenzar el crossfade (antes del cierre)
  let mixPoint = totalDur;
  for (let i = mixSil.length - 1; i >= 0; i--) {
    if (mixSil[i].end >= totalDur - 0.5 && mixSil[i].start <= finPoint) {
      mixPoint = mixSil[i].start;
      break;
    }
  }

  // Stat del archivo
  let fileSize = null, fileMtimeMs = null;
  try {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
    fileMtimeMs = Math.round(stat.mtimeMs);
  } catch(e) {}

  return {
    duration: parseFloat(totalDur.toFixed(3)),
    db_level: parseFloat(dbValue.toFixed(1)),
    peak_db: peakDbValue.toFixed(1),
    inicio: parseFloat(inicioPoint.toFixed(3)),
    mix: parseFloat(mixPoint.toFixed(3)),
    fin: parseFloat(finPoint.toFixed(3)),
    intro: parseFloat(inicioPoint.toFixed(3)), // Alias de inicio
    outro: parseFloat(finPoint.toFixed(3)),    // Alias de fin
    file_size: fileSize,
    file_mtime_ms: fileMtimeMs
  };
}

// === MOTOR DE COLA ===
function processNext() {
  if (cancelled || active >= MAX_CONCURRENT || queue.length === 0) return;

  const task = queue.shift();
  active++;

  analyzeWithFFmpeg(task.filePath, {
    dbMix:   task.dbMix   ?? -14,
    dbStart: task.dbStart ?? -36,
    dbFin:   task.dbFin   ?? -48
  })
  .then(data => {
    parentPort.postMessage({ type: 'result', payload: { success: true, filePath: task.filePath, data } });
  })
  .catch(err => {
    parentPort.postMessage({ type: 'result', payload: { success: false, filePath: task.filePath, error: err.message } });
  })
  .finally(() => {
    active--;
    if (queue.length === 0 && active === 0) {
      parentPort.postMessage({ type: 'finished' });
    } else {
      processNext();
    }
  });

  processNext(); // Iniciar más slots paralelos si hay disponibles
}

// === ENTRADA DE MENSAJES DEL PROCESO PRINCIPAL ===
parentPort.on('message', (msg) => {
  if (msg.type === 'analyze') {
    if (!Array.isArray(msg.files)) return;
    cancelled = false;
    queue.push(...msg.files.map(fp => typeof fp === 'string' ? { filePath: fp } : fp));
    parentPort.postMessage({ type: 'queued', total: queue.length });
    processNext();
  }

  if (msg.type === 'cancel') {
    cancelled = true;
    queue = [];
    parentPort.postMessage({ type: 'cancelled' });
  }
});
