const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const SUPABASE_URL = 'https://free.ksm.co';
const SUPABASE_KEY = 'FREE_ANON_KEY';
const APP_ID = 'auditor';
const IS_FREE_VERSION = true;

const CACHE_FILE = path.join(app.getPath('userData'), 'ksm_activation.dat');
const CACHE_DAYS = 7;

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
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (data.hwid !== getHWID() || data.appId !== APP_ID) return null;
    const age = (Date.now() - data.ts) / (1000 * 60 * 60 * 24);
    if (age > CACHE_DAYS) return null;
    return data;
  } catch { return null; }
}

function writeCache(hwid, cliente) {
  const data = { hwid, appId: APP_ID, cliente, ts: Date.now() };
  fs.writeFileSync(CACHE_FILE, Buffer.from(JSON.stringify(data)).toString('base64'), 'utf8');
}

function clearCache() {
  try { fs.unlinkSync(CACHE_FILE); } catch {}
}

async function checkOnline(hwid) {
  if (SUPABASE_URL.includes('REEMPLAZA') || SUPABASE_KEY.includes('REEMPLAZA') || !SUPABASE_URL) {
    return { authorized: true, cliente: 'MODO DESARROLLO (Sin Supabase)' };
  }
  
  try {
    const url = `${SUPABASE_URL}/rest/v1/licencias?hwid=eq.${encodeURIComponent(hwid)}&app_id=eq.${encodeURIComponent(APP_ID)}&select=*`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    if (data && data.length > 0) {
      const license = data[0];
      const activeState = license.activo ?? license.active;
      if (activeState === true || activeState === 'TRUE') {
        return { authorized: true, cliente: license.cliente || 'Usuario Registrado' };
      }
      return { authorized: false, reason: 'disabled' };
    }
    return { authorized: false, reason: 'not_found' };
  } catch (err) {
    throw err;
  }
}

async function checkLicense() {
  if (IS_FREE_VERSION) {
    return { licensed: true, cliente: 'Versión Gratuita' };
  }
  const hwid = getHWID();
  const cache = readCache();
  if (cache) return { licensed: true, hwid, cliente: cache.cliente, offline: true };
  
  try {
    const result = await checkOnline(hwid);
    if (result.authorized) {
      writeCache(hwid, result.cliente);
      return { licensed: true, hwid, cliente: result.cliente };
    }
    return { licensed: false, hwid, reason: result.reason };
  } catch (err) {
    return { licensed: false, hwid, error: 'sin_conexion' };
  }
}

async function revalidate() {
  clearCache();
  return checkLicense();
}

module.exports = { checkLicense, revalidate, getHWID };
