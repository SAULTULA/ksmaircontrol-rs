import { app } from 'electron';
import fs from 'fs';
import path from 'path';

let dbDir, configPath, playlistPath, adBlocksPath, cartwallPath;
let writeTimeoutPlaylist = null;
let writeTimeoutAdBlocks = null;
let writeTimeoutCartwall = null;

export function initDatabase() {
  dbDir = path.join(app.getPath('userData'), 'LocalStore');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  configPath = path.join(dbDir, 'config.json');
  playlistPath = path.join(dbDir, 'playlist.json');
  adBlocksPath = path.join(dbDir, 'adblocks.json');
  cartwallPath = path.join(dbDir, 'cartwall.json');

  if (!fs.existsSync(configPath)) {
    const randomHex = Math.floor(Math.random() * 10000000).toString(16);
    fs.writeFileSync(configPath, JSON.stringify({ 
      stationId: `radio-${randomHex}`, 
      stationName: '',
      supabaseUrl: 'https://fweswlbnnodinyqbtfpn.supabase.co',
      supabaseAnonKey: 'sb_publishable_' + 'W4v-Gno1gsWCFxNIQqcIOQ_IhCAUZ3c', 
      geminiApiKey: '',
      encoder: { server: '', port: '8000', mount: '/live', pass: '' } 
    }, null, 2), 'utf-8');
  }
  // Lógica de migración para asegurar que existan todos los campos requeridos
  let config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  let changed = false;

  // SIEMPRE forzamos las credenciales correctas de Supabase
  const correctUrl = 'https://fweswlbnnodinyqbtfpn.supabase.co';
  const correctKey = 'sb_publishable_' + 'W4v-Gno1gsWCFxNIQqcIOQ_IhCAUZ3c';
  if (config.supabaseUrl !== correctUrl) {
    config.supabaseUrl = correctUrl;
    changed = true;
    console.log('[Database] supabaseUrl corregida a', correctUrl);
  }
  if (config.supabaseAnonKey !== correctKey) {
    config.supabaseAnonKey = correctKey;
    changed = true;
    console.log('[Database] supabaseAnonKey corregida.');
  }
  if (!config.stationId) {
    const randomHex = Math.floor(Math.random() * 10000000).toString(16);
    config.stationId = `radio-${randomHex}`;
    changed = true;
  }

  if (!config.stationName) {
    config.stationName = config.stationId === 'ksm-studio-01' ? 'KSM Studio' : 'Mi Radio';
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log("[Database] Configuración actualizada automáticamente con llaves de Cerebro Central.");
  }
}

export function getConfig() { try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { return {}; } }
export function saveConfig(config) { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8'); return config; }

export function getPlaylist() { try { return JSON.parse(fs.readFileSync(playlistPath, 'utf-8')); } catch { return []; } }

// GUARDADO ASÍNCRONO CON DEBOUNCING (Evita corrupción de archivo y EBUSY)
export function savePlaylist(playlist) {
  if (writeTimeoutPlaylist) clearTimeout(writeTimeoutPlaylist);
  writeTimeoutPlaylist = setTimeout(() => {
    savePlaylistImmediate(playlist);
  }, 500); // 500ms de ventana de agrupación
  return playlist;
}

export function savePlaylistImmediate(playlist) {
  if (writeTimeoutPlaylist) clearTimeout(writeTimeoutPlaylist);
  try {
    const tempPath = playlistPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(playlist, null, 2), 'utf-8');
    fs.renameSync(tempPath, playlistPath); // Escritura atómica
    console.log("[Database] Playlist guardada correctamente.");
  } catch (err) { 
    console.warn("[Database] Error guardando playlist:", err); 
  }
}

export function getAdBlocks() { try { return JSON.parse(fs.readFileSync(adBlocksPath, 'utf-8')); } catch { return []; } }

export function saveAdBlocks(adBlocks) {
  if (writeTimeoutAdBlocks) clearTimeout(writeTimeoutAdBlocks);
  writeTimeoutAdBlocks = setTimeout(() => {
    try {
      const tempPath = adBlocksPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(adBlocks, null, 2), 'utf-8');
      fs.renameSync(tempPath, adBlocksPath);
    } catch (err) { console.warn("[Database] Error guardando adblocks:", err); }
  }, 500);
  return adBlocks;
}

export function getCartwall() { try { return JSON.parse(fs.readFileSync(cartwallPath, 'utf-8')); } catch { return []; } }

export function saveCartwall(carts) {
  if (writeTimeoutCartwall) clearTimeout(writeTimeoutCartwall);
  writeTimeoutCartwall = setTimeout(() => {
    try {
      // Guardamos solo los datos serializables (título y ruta), no el objeto de audio
      const serializableCarts = carts.map(c => ({
        id: c.id,
        title: c.title,
        shortcut: c.shortcut,
        filePath: c.filePath || (c.nativeFile ? c.nativeFile.path : null)
      }));
      const tempPath = cartwallPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(serializableCarts, null, 2), 'utf-8');
      fs.renameSync(tempPath, cartwallPath);
    } catch (err) { console.warn("[Database] Error guardando cartwall:", err); }
  }, 500);
  return carts;
}

// === GESTIÓN DE PERFILES Y BACKUPS ===

export function listProfiles() {
  const profilesDir = path.join(dbDir, 'profiles');
  if (!fs.existsSync(profilesDir)) return [];
  try {
    return fs.readdirSync(profilesDir).filter(file => {
      return fs.statSync(path.join(profilesDir, file)).isDirectory();
    });
  } catch {
    return [];
  }
}

export function createProfile(name) {
  const profilesDir = path.join(dbDir, 'profiles');
  const targetDir = path.join(profilesDir, name);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const files = ['config.json', 'playlist.json', 'adblocks.json', 'cartwall.json'];
  files.forEach(file => {
    const src = path.join(dbDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, file));
    }
  });
  return listProfiles();
}

export function loadProfile(name) {
  const profilesDir = path.join(dbDir, 'profiles');
  const srcDir = path.join(profilesDir, name);
  if (!fs.existsSync(srcDir)) return false;

  const files = ['config.json', 'playlist.json', 'adblocks.json', 'cartwall.json'];
  files.forEach(file => {
    const src = path.join(srcDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dbDir, file));
    }
  });
  return true;
}

export function deleteProfile(name) {
  const profilesDir = path.join(dbDir, 'profiles');
  const targetDir = path.join(profilesDir, name);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  return listProfiles();
}
