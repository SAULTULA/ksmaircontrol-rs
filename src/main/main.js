// Proceso de Python unificado para el Cerebro
import { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { initDatabase, getConfig, saveConfig, getPlaylist, savePlaylist, savePlaylistImmediate, getAdBlocks, saveAdBlocks, getCartwall, saveCartwall, listProfiles, createProfile, loadProfile, deleteProfile } from './database.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const license = require('./license.cjs');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');

let libraryDb = null;
try {
  libraryDb = require('./library_db.cjs');
} catch (e) {
  console.log('[KSM] Advertencia: Módulo SQLite no disponible. La librería avanzada estará deshabilitada.', e.message);
}

// ── Motor de Librería Musical (SQLite + FFmpeg) ──────────────────────────────
let analysisWorker = null;
let analysisCallbacks = new Map(); // Para reenviar resultados al renderer

function getAnalysisWorker(mainWindow) {
  if (analysisWorker) return analysisWorker;
  const workerPath = path.join(__dirname, 'workers', 'ksm_analysis_worker.cjs');
  analysisWorker = new Worker(workerPath);
  analysisWorker.on('message', (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('library:analysis-event', msg);
    }
  });
  analysisWorker.on('error', (err) => {
    console.error('[KSM Library] Error en worker de análisis:', err);
    analysisWorker = null;
  });
  return analysisWorker;
}

// Desactivar las advertencias de seguridad nativas de Electron en consola.
// El CSP incluye 'unsafe-eval' porque es estricta y obligatoriamente requerido por Vite en modo desarrollo.
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

protocol.registerSchemesAsPrivileged([
  { scheme: 'ksm', privileges: { bypassCSP: true, secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

// ── KSM REQUEST API (RadioBOSS Compatible) ───────────────────────────────────
let currentRadioBossPlaybackInfo = '<PlaybackInfo><Playing>0</Playing></PlaybackInfo>';

const rbApiServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');

  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const action = parsedUrl.searchParams.get('action');
    const pass = parsedUrl.searchParams.get('pass');
    
    // Obtener config para validar password si existe
    const cfg = getConfig();
    if (cfg.apiPassword && cfg.apiPassword.trim() !== '') {
      if (pass !== cfg.apiPassword) {
        res.writeHead(401);
        res.end('<Error>Unauthorized: Invalid Password</Error>');
        return;
      }
    }
    
    if (action === 'playbackinfo') {
      res.writeHead(200);
      res.end(currentRadioBossPlaybackInfo);
      return;
    }
    
    if (action === 'inserttrack') {
      // Parsear manualmente para no romper barras invertidas o espacios sin codificar
      let filename = parsedUrl.searchParams.get('filename');
      if (req.url.includes('filename=')) {
        const rawFilename = req.url.split('filename=')[1];
        try {
          // Reemplazar '+' por '%20' para soportar URLSearchParams.append y decodificar correctamente
          filename = decodeURIComponent(rawFilename.replace(/\+/g, '%20'));
        } catch(e) {
          filename = rawFilename.replace(/\+/g, ' '); // Si falla, usar crudo
        }
      }
      
      if (filename && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('radioboss-api:inserttrack', filename);
        res.writeHead(200);
        res.end('<OK/>');
      } else {
        res.writeHead(400);
        res.end('<Error>No filename provided or window destroyed</Error>');
      }
      return;
    }

    if (action === 'play') {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('radioboss-api:play');
      res.writeHead(200);
      res.end('<OK/>');
      return;
    }

    if (action === 'stop') {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('radioboss-api:stop');
      res.writeHead(200);
      res.end('<OK/>');
      return;
    }

    if (action === 'mic') {
      const micState = parsedUrl.searchParams.get('mic');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('radioboss-api:mic', micState === '1');
      res.writeHead(200);
      res.end('<OK/>');
      return;
    }

    if (action === 'webrtc-state') {
      const state = parsedUrl.searchParams.get('state');
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('radioboss-api:webrtc-state', state);
      res.writeHead(200);
      res.end('<OK/>');
      return;
    }

    if (action === 'setstationid') {
      const id = parsedUrl.searchParams.get('id');
      const url = parsedUrl.searchParams.get('url');
      const key = parsedUrl.searchParams.get('key');
      if (id && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ksm-api:set-station-id', { id, url, key });
        res.writeHead(200);
        res.end('<OK/>');
      } else {
        res.writeHead(400);
        res.end('<Error>No id provided or window destroyed</Error>');
      }
      return;
    }

    // Default response para otros comandos (ej. delete, clear)
    res.writeHead(200);
    res.end('<OK/>');
  } catch (err) {
    res.writeHead(500);
    res.end(`<Error>${err.message}</Error>`);
  }
});

// Iniciamos el servidor en el puerto configurado (o 9000 por defecto)
// Pequeño delay para asegurar que db está lista
setTimeout(() => {
  try {
    const cfg = getConfig();
    const port = cfg.apiPort || 9000;
    rbApiServer.listen(port, '0.0.0.0', () => {
      console.log(`[KSM Request API] Escuchando peticiones en el puerto ${port}`);
    });
  } catch(e) {
    console.error('[KSM Request API] Error al iniciar:', e);
  }
}, 1000);

ipcMain.on('radioboss-api:update-playbackinfo', (event, xmlData) => {
  currentRadioBossPlaybackInfo = xmlData;
});
// ────────────────────────────────────────────────────────────────────────────

let mainWindow;
let lastPlaylist = []; // Cache para guardado de emergencia al cerrar

function createWindow() {
  // 1. Inicializar Base de Datos Local
  initDatabase();

  // 2. Inicializar motor de librería SQLite (LF-Automatizador engine adaptado)
  try {
    libraryDb.initLibraryDB();
    console.log('[KSM Library] Motor de librería SQLite iniciado correctamente.');
  } catch (err) {
    console.error('[KSM Library] Error al inicializar la base de datos de librería:', err);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: true,
    title: "KSM AirControl",
    backgroundColor: '#0b0b12',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // --- SEGURIDAD KSM LICENSING SYSTEM ---
  mainWindow.webContents.once('did-finish-load', async () => {
    const result = await license.checkLicense();
    if (result.licensed) {
      mainWindow.webContents.send('license-ok', { cliente: result.cliente });
    } else {
      mainWindow.webContents.send('license-required', {
        hwid: result.hwid,
        error: result.error || null,
        reason: result.reason || null
      });
    }

    // Comprobar actualizaciones silenciosamente
    autoUpdater.checkForUpdatesAndNotify().catch(err => console.log('Updater Error:', err));
  });

  // Configuración de Auto-Updater
  autoUpdater.autoDownload = false; // No descargar sin permiso

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Actualización Disponible',
      message: `KSM AirControl v${info.version} está disponible.`,
      detail: info.releaseNotes ? String(info.releaseNotes).replace(/<[^>]+>/g, '') : 'Se han añadido nuevas mejoras y correcciones al sistema.',
      buttons: ['Descargar e Instalar', 'Recordar más tarde']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Descargando...',
          message: 'La actualización se está descargando en segundo plano. Te avisaremos cuando termine.'
        });
      }
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Actualización Lista',
      message: 'La nueva versión ya se descargó. ¿Deseas reiniciar la aplicación ahora para aplicarla?',
      buttons: ['Reiniciar y Aplicar', 'Más tarde']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  // Los manejadores IPC también están más abajo como license:getHWID, pero los duplicamos por si acaso el frontend usa este formato.
  ipcMain.handle('license-get-hwid', () => license.getHWID());
  ipcMain.handle('license-revalidate', async () => {
    const result = await license.revalidate();
    if (result.licensed) {
      mainWindow.webContents.send('license-ok', { cliente: result.cliente });
    }
    return result;
  });



  // 2. Manejadores IPC de Diálogos, Grabación y Rutas
  ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  });

  ipcMain.handle('save-file-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  });

  // Selector de carpeta de locuciones (hora, temperatura, humedad)
  ipcMain.handle('select-locuciones-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta de locuciones',
      properties: ['openDirectory'],
      buttonLabel: 'Seleccionar carpeta'
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const folder = result.filePaths[0];
    // Verificar que contenga las subcarpetas requeridas
    const required = ['time', 'temperature', 'humidity'];
    const found = required.filter(sub => {
      return fs.existsSync(path.join(folder, sub)) || 
             fs.existsSync(path.join(folder, sub.charAt(0).toUpperCase() + sub.slice(1)));
    });
    // Guardar en config sin importar si faltan carpetas (el usuario sabe lo que hace)
    const cfg = getConfig();
    cfg.locucionesPath = folder;
    saveConfig(cfg);
    console.log('[Locuciones] Carpeta guardada:', folder, '| Subcarpetas encontradas:', found);
    return { canceled: false, folder, found };
  });

  ipcMain.handle('save-file-data', async (event, { filePath, buffer }) => {
    try {
      fs.writeFileSync(filePath, Buffer.from(buffer));
      return true;
    } catch (err) {
      console.error("[Grabación] Error guardando archivo:", err);
      return false;
    }
  });

  ipcMain.on('show-item-in-folder', (event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // Exportar metadata de la canción actual a un TXT para el Agente y OBS
  ipcMain.on('update-now-playing', (event, trackInfo) => {
    try {
      const libraryDir = path.join(app.getPath('userData'), 'Libraries');
      if (!fs.existsSync(libraryDir)) {
        fs.mkdirSync(libraryDir, { recursive: true });
      }
      const title = trackInfo ? (trackInfo.title || trackInfo.name) : null;
      const text = title ? `${trackInfo.artist || 'Desconocido'} - ${title}` : 'KSM AirControl';
      fs.writeFileSync(path.join(libraryDir, 'NowPlaying.txt'), text, 'utf8');
      
      // Opcional: También guardar el cover si hay (útil para OBS)
      // Omitido para mantenerlo rápido, pero disponible para el futuro.
    } catch (e) {
      console.error('[NowPlaying] Error escribiendo TXT:', e);
    }
  });

  // ── GENERADOR DE LIBRERÍA KSM (Compatible con Request Song) ─────────────
  ipcMain.handle('generate-ksm-library', async (event, customName) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta(s) de música para escanear',
      properties: ['openDirectory', 'multiSelections'],
      buttonLabel: 'Escanear'
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const folders = result.filePaths; // ahora es un array

    const { generateLibraryXml } = await import('./library_scanner.js');
    
    // Podemos enviar progreso si queremos
    const onProgress = (prog) => {
      mainWindow.webContents.send('ksm-library-progress', prog);
    };

    try {
      const genResult = await generateLibraryXml(folders, onProgress, customName);
      return genResult;
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-ksm-libraries', async () => {
    try {
      const libraryDir = path.join(app.getPath('userData'), 'Libraries');
      if (fs.existsSync(libraryDir)) {
        const files = fs.readdirSync(libraryDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.xml')) {
            fs.unlinkSync(path.join(libraryDir, file));
          }
        }
      }
      return { success: true };
    } catch (err) {
      console.error('[Library] Error limpiando librerías:', err);
      return { success: false, error: err.message };
    }
  });

  // ── RUTAS DE AUDIO (Reemplaza el protocolo ksm:/// por rutas reales de Windows) ─────────────────────────────────
  // Usa FFmpeg (ffmpeg-static ya instalado) para codificar PCM → MP3/AAC.
  // Mucho más robusto que lamejs que falla con módulos nativos en Electron.
  const net = require('net');
  const tls = require('tls');
  let ffmpegPath = null;
  try {
    ffmpegPath = require('ffmpeg-static');
    console.log('[Streaming] FFmpeg encontrado en:', ffmpegPath);
  } catch(e) {
    console.error('[Streaming] ffmpeg-static no disponible:', e.message);
  }

  let broadcastSocket    = null;
  let ffmpegProcess      = null;
  let currentStreamingConfig = null;

  ipcMain.handle('start-streaming', async (event, config) => {
    try {
      // Cerrar conexión anterior si existe
      if (ffmpegProcess) {
        try { ffmpegProcess.stdin.end(); ffmpegProcess.kill('SIGKILL'); } catch(e){}
        ffmpegProcess = null;
      }
      if (broadcastSocket) {
        try { broadcastSocket.destroy(); } catch(e){}
        broadcastSocket = null;
      }

      if (!ffmpegPath) {
        return { success: false, error: 'FFmpeg no está disponible en este sistema.' };
      }

      const isSecure   = config.server.startsWith('https');
      const cleanServer = config.server.replace(/^https?:\/\//, '');
      const port       = parseInt(config.port) || (isSecure ? 443 : 8000);
      const mount      = config.mount.startsWith('/') ? config.mount : '/' + config.mount;
      const bitrate    = parseInt(config.bitrate) || 128;

      return new Promise((resolve) => {
        // 1. Conectar el socket TCP/TLS a Icecast
        const connectOptions = { host: cleanServer, port, rejectUnauthorized: false };
        const onSocketConnect = () => {
          console.log(`[Icecast] Conectado a ${cleanServer}:${port}`);
          currentStreamingConfig = config;

          const auth = Buffer.from(`source:${config.pass}`).toString('base64');
          const headers =
            `SOURCE ${mount} HTTP/1.0\r\n` +
            `Host: ${cleanServer}:${port}\r\n` +
            `Authorization: Basic ${auth}\r\n` +
            `User-Agent: KSMAirControl/1.0\r\n` +
            `Content-Type: audio/mpeg\r\n` +
            `icy-name: ${config.stationName || 'KSM AirControl'}\r\n` +
            `icy-genre: Studio\r\n` +
            `icy-pub: 1\r\n` +
            `icy-br: ${bitrate}\r\n` +
            `Connection: keep-alive\r\n\r\n`;
          broadcastSocket.write(headers);
        };

        let handshakeDone = false;
        const onSocketData = (data) => {
          const resp = data.toString();
          console.log('[Icecast] Respuesta servidor:', resp.split('\r\n')[0]);
          if (!handshakeDone) {
            if (resp.includes('200') || resp.includes('OK') || resp.includes('Continue')) {
              handshakeDone = true;

              // 2. Arrancar FFmpeg: stdin=PCM s16le → stdout=MP3
              const ffArgs = [
                '-loglevel', 'error',
                '-f', 's16le',      // formato de entrada: PCM signed 16-bit little-endian
                '-ar', '44100',     // sample rate
                '-ac', '2',         // canales (estéreo)
                '-i', 'pipe:0',     // leer desde stdin
                '-codec:a', 'libmp3lame',
                '-b:a', `${bitrate}k`,
                '-f', 'mp3',
                'pipe:1'            // escribir MP3 a stdout
              ];

              ffmpegProcess = spawn(ffmpegPath, ffArgs);

              // 3. Cada frame MP3 que produce FFmpeg → directo al socket Icecast
              ffmpegProcess.stdout.on('data', (mp3Chunk) => {
                if (broadcastSocket && !broadcastSocket.destroyed) {
                  broadcastSocket.write(mp3Chunk);
                }
              });

              ffmpegProcess.stderr.on('data', (d) => {
                console.warn('[FFmpeg]', d.toString().trim());
              });

              ffmpegProcess.on('close', (code) => {
                console.log(`[FFmpeg] Proceso terminado con código ${code}`);
                ffmpegProcess = null;
              });

              console.log('[Icecast] Handshake OK. FFmpeg encoder iniciado.');
              resolve({ success: true });
            } else if (resp.includes('401') || resp.includes('403') || resp.includes('404')) {
              broadcastSocket.destroy();
              broadcastSocket = null;
              resolve({ success: false, error: resp.split('\r\n')[0] });
            }
          }
        };

        const onSocketError = (err) => {
          console.error('[Icecast] Error de socket:', err.message);
          if (!handshakeDone) resolve({ success: false, error: err.message });
        };

        const onSocketClose = () => {
          console.log('[Icecast] Socket cerrado por servidor.');
          broadcastSocket = null;
        };

        broadcastSocket = isSecure
          ? tls.connect(connectOptions, onSocketConnect)
          : net.createConnection(connectOptions, onSocketConnect);

        broadcastSocket.setNoDelay(true);
        broadcastSocket.on('data',  onSocketData);
        broadcastSocket.on('error', onSocketError);
        broadcastSocket.on('close', onSocketClose);
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Recibe PCM int16 interleaved (L/R) desde el renderer y lo escribe en FFmpeg stdin
  ipcMain.on('stream-pcm-chunk', (event, { left, right }) => {
    if (!ffmpegProcess || !ffmpegProcess.stdin || ffmpegProcess.stdin.destroyed) return;
    try {
      // Interleave L y R en un solo buffer de bytes (formato s16le estéreo)
      const samples = left.length;
      const buf = Buffer.allocUnsafe(samples * 4); // 2 bytes × 2 canales por muestra
      for (let i = 0; i < samples; i++) {
        buf.writeInt16LE(left[i],  i * 4);
        buf.writeInt16LE(right[i], i * 4 + 2);
      }
      ffmpegProcess.stdin.write(buf);
    } catch (err) {
      console.warn('[Streaming] Error escribiendo PCM a FFmpeg:', err.message);
    }
  });

  ipcMain.on('stream-audio-chunk', (event, chunk) => {
    // Canal alternativo: datos ya codificados (ej. WebM del MediaRecorder)
    if (broadcastSocket && !broadcastSocket.destroyed) {
      try { broadcastSocket.write(Buffer.from(chunk)); } catch(e){}
    }
  });

  ipcMain.handle('stop-streaming', () => {
    if (ffmpegProcess) {
      try { ffmpegProcess.stdin.end(); } catch(e){}
      try { ffmpegProcess.kill('SIGKILL'); } catch(e){}
      ffmpegProcess = null;
    }
    if (broadcastSocket) {
      try { broadcastSocket.destroy(); } catch(e){}
      broadcastSocket = null;
    }
    currentStreamingConfig = null;
    return true;
  });

  // --- MANEJADORES NATIVOS DEL CEREBRO COGNITIVO (En reemplazo de Python FastAPI) ---

  // 1. Consulta al Asistente de IA (Gemini API con fallback RAG local offline)
  ipcMain.handle('cognitive-agent-query', async (event, payload) => {
    const { query, geminiApiKey, currentTrack, tracksCount } = payload;
    const queryLower = query.toLowerCase();

    // Cargar mapa semántico del proyecto
    let contextData = {};
    const contextPath = path.join(__dirname, '../../brain/context_brain.json');
    if (fs.existsSync(contextPath)) {
      try {
        contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      } catch (e) {
        console.warn("[Cerebro Nativo] Error cargando context_brain.json:", e.message);
      }
    }

    const projectName = contextData.projectName || "ksm-aircontrol";
    const techStack = contextData.techStack || [];
    const detectedAPIs = contextData.detectedAPIs || [];
    const detectedIPC = contextData.detectedIPC || [];
    const uiViews = contextData.uiViews || [];
    const summary = contextData.summary || "";

    if (geminiApiKey) {
      const systemInstruction = `
Eres el Copiloto de Inteligencia Artificial para la aplicación KSM AirControl (KSMAirControl) de automatización de radio.
Tu rol es asistir al usuario con preguntas sobre la aplicación, la base de código, la configuración y el entorno.
Tienes acceso al siguiente mapa semántico del proyecto:
- Nombre del proyecto: ${projectName}
- Stack tecnológico: ${techStack.join(', ')}
- APIs detectadas en el backend: ${detectedAPIs.join(', ')}
- Canales de IPC: ${detectedIPC.join(', ')}
- Componentes UI: ${uiViews.join(', ')}
- Resumen: ${summary}

INSTRUCCIONES DE CONTROL DEL ENTORNO:
Puedes interactuar con el entorno emitiendo comandos especiales al final de tu respuesta en una línea nueva. El sistema interpretará estos comandos y controlará la reproducción y temas de forma nativa.
Comandos soportados:
- Si el usuario te pide reproducir la música, poner un tema, dar play o iniciar reproducción, agrega al final en una nueva línea: [CMD:PLAY]
- Si el usuario te pide detener la música, pausar, parar o silenciar la reproducción principal, agrega al final en una nueva línea: [CMD:STOP]
- Si el usuario te pide dar la hora o activar la locución horaria, agrega al final en una nueva línea: [CMD:ANNOUNCE_TIME]
- Si el usuario te pide cambiar el aspecto, skin o tema visual, agrega al final en una nueva línea: [CMD:CHANGE_SKIN: <skin>] (donde <skin> debe ser exactamente uno de: studio-dark, radioboss-silver, salamandra-blue o cyber-neon).

Sé amable, profesional y responde siempre en español de manera concisa.
`;

      let currentTrackInfo = "";
      if (currentTrack) {
        currentTrackInfo = `[Estado Actual de Reproducción: Canción '${currentTrack.title}' por '${currentTrack.artist}', Pistas en Lista: ${tracksCount}]\n`;
      } else {
        currentTrackInfo = `[Estado Actual de Reproducción: Nada reproduciéndose en este momento, Pistas en Lista: ${tracksCount}]\n`;
      }

      const fullPrompt = `${currentTrackInfo}Pregunta del usuario: ${query}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: fullPrompt }] }
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }]
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const resData = await response.json();
        const candidates = resData.candidates || [];
        if (candidates.length > 0) {
          const parts = candidates[0].content?.parts || [];
          if (parts.length > 0) {
            return {
              status: "success",
              query,
              response: parts[0].text || "No se pudo extraer el texto de la respuesta de Gemini."
            };
          }
        }
        return {
          status: "success",
          query,
          response: "No se pudo extraer el texto de la respuesta de Gemini."
        };
      } catch (err) {
        console.error("[Cerebro Nativo] Error llamando a Gemini:", err.message);
        return {
          status: "error",
          query,
          response: `Error al conectar con la API de Gemini: ${err.message}`
        };
      }
    }

    // Fallback Offline RAG local
    let responseText = "";
    if (queryLower.includes("api") || queryLower.includes("endpoint") || queryLower.includes("ruta")) {
      responseText = `He analizado ${projectName} y detecté que consume las siguientes APIs externas: ${detectedAPIs.join(', ')}.`;
    } else if (queryLower.includes("ipc") || queryLower.includes("comunicacion") || queryLower.includes("bridge")) {
      responseText = `La aplicación ${projectName} utiliza comunicación nativa mediante los canales IPC: ${detectedIPC.join(', ')}.`;
    } else if (queryLower.includes("vista") || queryLower.includes("pantalla") || queryLower.includes("componente") || queryLower.includes("ui")) {
      responseText = `He mapeado el frontend React de ${projectName}. Encontré los siguientes componentes clave en tu carpeta /src: ${uiViews.join(', ')}.`;
    } else if (queryLower.includes("ayuda") || queryLower.includes("hola") || queryLower.includes("quien eres")) {
      responseText = `¡Hola! Soy el Asistente de IA Local de ${projectName}. Conozco tu base de código y puedo informarte sobre: 1. APIs detectadas, 2. Canales IPC expuestos, 3. Componentes React de UI, o 4. Cómo expandir tu software.`;
    } else {
      responseText = `Entiendo tu consulta sobre '${query}'. Como asistente inteligente de ${projectName}, te confirmo que cuento con RAG local offline y conozco tu stack tecnológico y tus componentes detectados.`;
    }

    responseText += "\n\n💡 *Tip: Puedes configurar tu API Key de Gemini en los ajustes para fortalecer este Cerebro y hacerlo inteligente.*";

    return {
      status: "success",
      query,
      response: responseText
    };
  });

  // 2. Secuenciador de Locución Horaria y Clima desde archivos MP3 pregrabados
  ipcMain.handle('get-voice-announcement', async (event, payload) => {
    const { temp, hum } = payload;
    const cfg = getConfig();

    // Prioridad 1: carpeta configurada por el usuario
    let basePath = cfg.locucionesPath || null;

    // Prioridad 2: ruta relativa al ejecutable
    if (!basePath || !fs.existsSync(basePath)) {
      const rootPath = path.join(__dirname, '../../');
      const candidate = path.join(rootPath, "s", "temperatura humedad y hora -beatifur water");
      if (fs.existsSync(candidate)) basePath = candidate;
    }

    // Prioridad 3: ruta absoluta de desarrollo
    if (!basePath || !fs.existsSync(basePath)) {
      const devCandidate = "e:\\auditor\\s\\temperatura humedad y hora -beatifur water";
      if (fs.existsSync(devCandidate)) basePath = devCandidate;
    }

    // Función para encontrar carpeta ignorando mayúsculas/minúsculas
    function resolveSubfolder(base, name) {
      if (!base || !fs.existsSync(base)) return null;
      // Intenta nombre exacto, luego capitalizado, luego uppercase
      for (const variant of [name, name.charAt(0).toUpperCase() + name.slice(1), name.toUpperCase()]) {
        const p = path.join(base, variant);
        if (fs.existsSync(p)) return p;
      }
      return null;
    }

    const folders = {
      time: resolveSubfolder(basePath, 'time'),
      temp: resolveSubfolder(basePath, 'temperature'),
      hum:  resolveSubfolder(basePath, 'humidity')
    };

    console.log('[Locuciones] Usando carpeta base:', basePath);
    console.log('[Locuciones] Subcarpetas:', folders);

    function findFile(folder, filename) {
      if (!folder || !fs.existsSync(folder)) return null;
      let p = path.join(folder, filename);
      if (fs.existsSync(p)) return p;
      const alt = filename.endsWith(".mp3") ? filename.replace(".mp3", ".MP3") : filename.replace(".MP3", ".mp3");
      p = path.join(folder, alt);
      if (fs.existsSync(p)) return p;
      return null;
    }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = now.getMinutes();

    const sequence = [];
    if (mm === 0) {
      const p = findFile(folders.time, `HRS${hh}_O.mp3`);
      if (p) sequence.push(p);
    } else {
      const p1 = findFile(folders.time, `HRS${hh}.mp3`);
      const p2 = findFile(folders.time, `MIN${String(mm).padStart(2, '0')}.mp3`);
      if (p1) sequence.push(p1);
      if (p2) sequence.push(p2);
    }

    try {
      const tempVal = parseInt(temp);
      const humVal = parseInt(hum);
      const tFile = tempVal >= 0
        ? `TMP${String(Math.abs(tempVal)).padStart(3, '0')}.mp3`
        : `TMPN${String(Math.abs(tempVal)).padStart(3, '0')}.mp3`;
      const tPath = findFile(folders.temp, tFile);
      if (tPath) sequence.push(tPath);

      const hFile = `HUM${String(humVal).padStart(3, '0')}.mp3`;
      const hPath = findFile(folders.hum, hFile);
      if (hPath) sequence.push(hPath);
    } catch (e) {
      console.error("[Locuciones] Error armando secuencia de clima:", e);
    }

    if (sequence.length > 0) {
      // Archivos locales encontrados → convertir a ksm:// para que Electron los sirva
      for (let i = 0; i < sequence.length; i++) {
        if (sequence[i]) {
          sequence[i] = 'ksm:///' + sequence[i].replace(/\\/g, '/');
        }
      }
      console.log('[Locuciones] Sirviendo archivos LOCALES via ksm://');
    } else {
      // Sin archivos locales → intentar Supabase como fallback
      const supabaseUrl = cfg.supabaseUrl?.replace(/\/$/, '').replace(/\/rest\/v1\/?$/i, '');
      if (supabaseUrl && supabaseUrl.startsWith('https://')) {
        console.log('[Locuciones] Sin archivos locales. Usando Supabase como fallback...');
        const bucket = 'locuciones';
        const remote = (folder, filename) =>
          `${supabaseUrl}/storage/v1/object/public/${bucket}/${folder}/${filename}`;

        const now2 = new Date();
        const hh2 = String(now2.getHours()).padStart(2, '0');
        const mm2 = now2.getMinutes();

        if (mm2 === 0) {
          sequence.push(remote('time', `HRS${hh2}_O.mp3`));
        } else {
          sequence.push(remote('time', `HRS${hh2}.mp3`));
          sequence.push(remote('time', `MIN${String(mm2).padStart(2, '0')}.mp3`));
        }
        const tVal = parseInt(temp);
        const tFile = tVal >= 0
          ? `TMP${String(Math.abs(tVal)).padStart(3, '0')}.mp3`
          : `TMPN${String(Math.abs(tVal)).padStart(3, '0')}.mp3`;
        sequence.push(remote('temperature', tFile));
        sequence.push(remote('humidity', `HUM${String(parseInt(hum)).padStart(3, '0')}.mp3`));
      } else {
        console.warn('[Locuciones] Sin archivos locales y sin Supabase configurado. Nada que reproducir.');
      }
    }

    console.log('[Locuciones] Secuencia final:', sequence);
    return { sequence };
  });

  // 3. Estado de la transmisión nativa (para NativeMonitor)
  ipcMain.handle('get-streaming-status', () => {
    return {
      audio_engine: {
        streaming: broadcastSocket !== null && !broadcastSocket.destroyed,
        engine: "Electron/Node Socket",
        brain: "online",
        port: broadcastSocket ? broadcastSocket.remotePort : null
      }
    };
  });

  ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData');
  });

  ipcMain.handle('get-hwid', async () => {
    const os = require('os');
    const crypto = require('crypto');
    const machineInfo = os.hostname() + os.cpus()[0].model + os.totalmem();
    return crypto.createHash('sha256').update(machineInfo).digest('hex');
  });

  // Manejadores IPC Licencias
  ipcMain.handle('license:getHWID', () => license.getHWID());
  ipcMain.handle('license:revalidate', async () => {
    const result = await license.revalidate();
    if (result.licensed) mainWindow.webContents.send('license:ok', { cliente: result.cliente });
    return result;
  });

  // 3. Manejadores IPC de Base de Datos Local
  ipcMain.handle('db-get-config', () => getConfig());
  ipcMain.handle('db-save-config', (event, config) => saveConfig(config));

  ipcMain.handle('db-get-playlist', () => getPlaylist());
  ipcMain.handle('db-save-playlist', (event, playlist) => {
    lastPlaylist = playlist;
    return savePlaylist(playlist);
  });
  ipcMain.handle('db-save-playlist-immediate', (event, playlist) => {
    lastPlaylist = playlist;
    return savePlaylistImmediate(playlist);
  });


  ipcMain.handle('db-get-adblocks', () => getAdBlocks());
  ipcMain.handle('db-save-adblocks', (event, adBlocks) => saveAdBlocks(adBlocks));
  
  ipcMain.handle('db-get-cartwall', () => getCartwall());
  ipcMain.handle('db-save-cartwall', (event, carts) => saveCartwall(carts));

  // --- PERFILES ---
  ipcMain.handle('db-list-profiles', () => listProfiles());
  ipcMain.handle('db-create-profile', (event, name) => createProfile(name));
  ipcMain.handle('db-load-profile', (event, name) => loadProfile(name));
  ipcMain.handle('db-delete-profile', (event, name) => deleteProfile(name));

  // =========================================================================
  // LIBRERÍA MUSICAL (Motor adaptado de LF-Automatizador)
  // Estos canales IPC NO reemplazan nada existente. Son puramente aditivos.
  // =========================================================================

  // Buscar / Listar pistas en la librería SQLite
  ipcMain.handle('library:search', (event, params) => {
    try { return { success: true, tracks: libraryDb.searchTracks(params || {}) }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Estadísticas de la librería
  ipcMain.handle('library:stats', () => {
    try {
      return {
        success: true,
        totalTracks: libraryDb.getTrackCount(),
        genres: libraryDb.getGenres(),
        folders: libraryDb.getFolders()
      };
    } catch (err) { return { success: false, error: err.message }; }
  });

  // Guardar/Actualizar una pista en la librería
  ipcMain.handle('library:upsert-track', (event, track) => {
    try { libraryDb.upsertTrack(track); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Guardar múltiples pistas (ej. resultado de un drag-and-drop masivo)
  ipcMain.handle('library:upsert-tracks', (event, tracks) => {
    try { libraryDb.upsertTracks(tracks); return { success: true, count: tracks.length }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Obtener una pista por su ruta
  ipcMain.handle('library:get-track', (event, filePath) => {
    try { return { success: true, track: libraryDb.getTrack(filePath) }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Escanear carpeta y agregar MP3s a la librería
  ipcMain.handle('library:scan-folder', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carpeta de música para la Librería',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const folderPath = result.filePaths[0];

    // Escaneo recursivo de archivos de audio
    const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a|aac|aiff|mp2)$/i;
    const audioFiles = [];
    function scanDir(dir) {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanDir(full); }
          else if (AUDIO_EXT.test(entry.name)) audioFiles.push(full);
        }
      } catch(e) {}
    }
    scanDir(folderPath);

    // Registrar pistas básicas en SQLite (sin análisis aún)
    const now = new Date().toISOString();
    const tracks = audioFiles.map(fp => {
      const name = path.basename(fp, path.extname(fp));
      const parts = name.split(' - ');
      return {
        file_path: fp,
        title: parts.length >= 2 ? parts.slice(1).join(' - ').trim() : name,
        artist: parts.length >= 2 ? parts[0].trim() : null,
        added_at: now,
        analyzed: 0
      };
    });

    libraryDb.upsertTracks(tracks);
    libraryDb.upsertFolder(folderPath, audioFiles.length);

    console.log(`[KSM Library] Carpeta escaneada: ${folderPath} | ${audioFiles.length} archivos encontrados.`);
    return { success: true, folder: folderPath, count: audioFiles.length };
  });

  // Iniciar análisis FFmpeg en background de pistas no analizadas
  ipcMain.handle('library:analyze-pending', (event, options) => {
    try {
      const pending = libraryDb.getUnanalyzedTracks(options?.limit || 100);
      if (!pending.length) return { success: true, queued: 0, message: 'No hay pistas pendientes de análisis.' };
      const worker = getAnalysisWorker(mainWindow);
      worker.postMessage({ type: 'analyze', files: pending.map(r => r.file_path) });
      return { success: true, queued: pending.length };
    } catch (err) { return { success: false, error: err.message }; }
  });

  // Cuando el worker termina un análisis, guardarlo en SQLite
  // (el evento llega vía 'library:analysis-event' al renderer, aquí lo guardamos en la BD)
  if (analysisWorker) {
    analysisWorker.on('message', (msg) => {
      if (msg.type === 'result' && msg.payload?.success) {
        const { filePath, data } = msg.payload;
        try { libraryDb.updateTrackAnalysis(filePath, data); } catch(e) {}
      }
    });
  }

  // Cancelar análisis en curso
  ipcMain.handle('library:cancel-analysis', () => {
    if (analysisWorker) analysisWorker.postMessage({ type: 'cancel' });
    return { success: true };
  });

  // Settings de la librería
  ipcMain.handle('library:get-setting', (event, key) => {
    try { return libraryDb.getLibrarySetting(key); } catch { return null; }
  });
  ipcMain.handle('library:set-setting', (event, key, value) => {
    try { libraryDb.setLibrarySetting(key, value); return { success: true }; } catch(err) { return { success: false }; }
  });

  // 4. MENÚ NATIVO PROFESIONAL
  const template = [
    {
      label: 'Archivo',
      submenu: [{ label: 'Salir', role: 'quit' }]
    },
    ...(!app.isPackaged ? [{
      label: 'Desarrollo',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Herramientas de Desarrollo', role: 'toggleDevTools' }
      ]
    }] : []),
    {
      label: 'Configuración',
      submenu: [
        { label: 'Preferencias del Sistema', click: () => { mainWindow.webContents.send('open-config'); } },
        { label: 'Bancos de Voz', click: () => { mainWindow.webContents.send('open-config'); } },
        { label: 'Encoder y Streaming', click: () => { mainWindow.webContents.send('open-config'); } }
      ]
    }
  ];

  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  } else {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('ksm', (request, callback) => {
    // Eliminar ksm:// o ksm:/// de la URL
    let url = request.url.replace(/^ksm:\/\/\/?/i, '');
    url = decodeURI(url);
    // Chromium a veces elimina los dos puntos de la letra de la unidad en Windows si 'standard: true'
    // Convierte "ksm://e/auditor/..." a "e/auditor/..." -> Restauramos a "e:/auditor/..."
    if (/^[a-zA-Z]\//.test(url)) {
      url = url.charAt(0) + ':' + url.slice(1);
    }
    callback({ path: path.normalize(url) });
  });
  createWindow();
});

app.on('before-quit', () => {
  console.log("[App] Cerrando... Asegurando persistencia de datos.");
  if (lastPlaylist && lastPlaylist.length > 0) {
    savePlaylistImmediate(lastPlaylist);
  }
  // Cerrar la BD de librería limpiamente
  try { libraryDb.closeDB(); } catch(e) {}
  // Terminar el worker de análisis si estaba activo
  if (analysisWorker) { try { analysisWorker.terminate(); } catch(e) {} analysisWorker = null; }
});

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
