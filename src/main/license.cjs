const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// ⚠️ CONFIGURAR ANTES DE COMPILAR — URL del Apps Script desplegado
const APPS_SCRIPT_URL = 'REEMPLAZA_CON_TU_URL_DE_APPS_SCRIPT';

const CACHE_FILE = path.join(app.getPath('userData'), 'ksm_activation.dat');
const CACHE_DAYS = 7; // días antes de re-verificar online

function getHWID() {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model ?? 'unknown',
    os.totalmem().toString(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex')
    .toUpperCase().slice(0, 32);
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw  = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (data.hwid !== getHWID()) return null;
    const age = (Date.now() - data.ts) / (1000 * 60 * 60 * 24);
    if (age > CACHE_DAYS) return null;
    return data;
  } catch { return null; }
}

function writeCache(hwid, cliente) {
  const data = { hwid, cliente, ts: Date.now() };
  fs.writeFileSync(CACHE_FILE, Buffer.from(JSON.stringify(data)).toString('base64'), 'utf8');
}

function clearCache() {
  try { fs.unlinkSync(CACHE_FILE); } catch { /* ignorar */ }
}

async function checkOnline(hwid) {
  if (APPS_SCRIPT_URL === 'REEMPLAZA_CON_TU_URL_DE_APPS_SCRIPT') {
    // Modo DEV: si la URL no está configurada, siempre autoriza (solo para desarrollo)
    console.warn('[LICENSE] URL no configurada. MODO DEV: autorizado.');
    return { authorized: true, cliente: 'DEV MODE' };
  }
  const url = `${APPS_SCRIPT_URL}?hwid=${encodeURIComponent(hwid)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

async function checkLicense() {
  const hwid = getHWID();
  const cache = readCache();
  if (cache) return { licensed: true, hwid, cliente: cache.cliente, offline: false };
  try {
    const result = await checkOnline(hwid);
    if (result.authorized) {
      writeCache(hwid, result.cliente ?? 'Licencia Válida');
      return { licensed: true, hwid, cliente: result.cliente };
    }
    return { licensed: false, hwid };
  } catch (err) {
    return { licensed: false, hwid, error: 'sin_conexion' };
  }
}

async function revalidate() {
  clearCache();
  return checkLicense();
}

module.exports = { checkLicense, revalidate, getHWID };
