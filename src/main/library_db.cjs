/**
 * library_db.js
 * Motor de Base de Datos SQLite para la Librería Musical de KSM AirControl.
 * Adaptado desde LF-Automatizador 0.9.14 por KSM Servicios.
 * 
 * Gestiona: tracks (con puntos de mezcla FFmpeg), artistas, géneros y settings de la librería.
 * La BD de configuración del sistema (config.json, etc.) sigue en database.js original.
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function getLibraryDbPath() {
  const userDataPath = app.getPath('userData');
  const libDir = path.join(userDataPath, 'Library');
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  return path.join(libDir, 'ksm_library.sqlite');
}

function initLibraryDB() {
  if (db) return db;

  const dbPath = getLibraryDbPath();
  db = new Database(dbPath);

  // Optimizaciones de rendimiento (igual que LF)
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -16000');   // 16 MB caché
  db.pragma('temp_store = MEMORY');

  // Tabla principal de pistas con puntos de mezcla calculados por FFmpeg
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      file_path     TEXT PRIMARY KEY,
      title         TEXT,
      artist        TEXT,
      album         TEXT,
      year          TEXT,
      genre         TEXT,
      duration      REAL,
      bpm           REAL,
      db_level      REAL,
      peak_db       TEXT,
      inicio        REAL,
      intro         REAL,
      mix           REAL,
      outro         REAL,
      fin           REAL,
      file_size     INTEGER,
      file_mtime_ms INTEGER,
      analyzed      INTEGER DEFAULT 0,
      added_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre  ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_analyzed ON tracks(analyzed);
  `);

  // Tabla de carpetas de librería escaneadas
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_folders (
      folder_path TEXT PRIMARY KEY,
      last_scan   TEXT,
      track_count INTEGER DEFAULT 0
    );
  `);

  // Settings de la librería (independientes de la config del sistema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_settings (
      key   TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);

  console.log('[LibraryDB] Base de datos de librería lista en:', dbPath);

  // WAL checkpoint cada 30 min
  const timer = setInterval(() => {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
  }, 30 * 60 * 1000);
  if (timer.unref) timer.unref();

  return db;
}

// === API de Acceso ===

function getDB() {
  if (!db) throw new Error('[LibraryDB] La base de datos no ha sido inicializada. Llama initLibraryDB() primero.');
  return db;
}

// --- TRACKS ---
function upsertTrack(track) {
  const d = getDB();
  d.prepare(`
    INSERT INTO tracks (file_path, title, artist, album, year, genre, duration, bpm, db_level, peak_db,
      inicio, intro, mix, outro, fin, file_size, file_mtime_ms, analyzed, added_at)
    VALUES (@file_path, @title, @artist, @album, @year, @genre, @duration, @bpm, @db_level, @peak_db,
      @inicio, @intro, @mix, @outro, @fin, @file_size, @file_mtime_ms, @analyzed, @added_at)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      year = excluded.year,
      genre = excluded.genre,
      duration = excluded.duration,
      bpm = excluded.bpm,
      db_level = excluded.db_level,
      peak_db = excluded.peak_db,
      inicio = COALESCE(excluded.inicio, inicio),
      intro = COALESCE(excluded.intro, intro),
      mix = COALESCE(excluded.mix, mix),
      outro = COALESCE(excluded.outro, outro),
      fin = COALESCE(excluded.fin, fin),
      file_size = excluded.file_size,
      file_mtime_ms = excluded.file_mtime_ms,
      analyzed = excluded.analyzed
  `).run({
    file_path: track.file_path,
    title: track.title || null,
    artist: track.artist || null,
    album: track.album || null,
    year: track.year || null,
    genre: track.genre || null,
    duration: track.duration || null,
    bpm: track.bpm || null,
    db_level: track.db_level || null,
    peak_db: track.peak_db || null,
    inicio: track.inicio || null,
    intro: track.intro || null,
    mix: track.mix || null,
    outro: track.outro || null,
    fin: track.fin || null,
    file_size: track.file_size || null,
    file_mtime_ms: track.file_mtime_ms || null,
    analyzed: track.analyzed ? 1 : 0,
    added_at: track.added_at || new Date().toISOString()
  });
}

function upsertTracks(tracks) {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO tracks (file_path, title, artist, album, year, genre, duration, bpm, db_level, peak_db,
      inicio, intro, mix, outro, fin, file_size, file_mtime_ms, analyzed, added_at)
    VALUES (@file_path, @title, @artist, @album, @year, @genre, @duration, @bpm, @db_level, @peak_db,
      @inicio, @intro, @mix, @outro, @fin, @file_size, @file_mtime_ms, @analyzed, @added_at)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title, artist = excluded.artist, album = excluded.album, genre = excluded.genre,
      duration = excluded.duration, file_size = excluded.file_size, file_mtime_ms = excluded.file_mtime_ms
  `);
  const insertMany = d.transaction((items) => {
    for (const t of items) stmt.run({
      file_path: t.file_path, title: t.title || null, artist: t.artist || null,
      album: t.album || null, year: t.year || null, genre: t.genre || null,
      duration: t.duration || null, bpm: t.bpm || null, db_level: t.db_level || null,
      peak_db: t.peak_db || null, inicio: t.inicio || null, intro: t.intro || null,
      mix: t.mix || null, outro: t.outro || null, fin: t.fin || null,
      file_size: t.file_size || null, file_mtime_ms: t.file_mtime_ms || null,
      analyzed: t.analyzed ? 1 : 0, added_at: t.added_at || new Date().toISOString()
    });
  });
  insertMany(tracks);
}

function getTrack(filePath) {
  return getDB().prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath);
}

function searchTracks({ query = '', genre = '', limit = 200, offset = 0 } = {}) {
  const d = getDB();
  const conditions = [];
  const params = [];

  if (query) {
    conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ?)');
    const q = `%${query}%`;
    params.push(q, q, q);
  }
  if (genre) {
    conditions.push('genre = ?');
    params.push(genre);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);
  return d.prepare(`SELECT * FROM tracks ${where} ORDER BY artist, title LIMIT ? OFFSET ?`).all(...params);
}

function getUnanalyzedTracks(limit = 50) {
  return getDB().prepare('SELECT file_path FROM tracks WHERE analyzed = 0 LIMIT ?').all(limit);
}

function updateTrackAnalysis(filePath, analysisData) {
  getDB().prepare(`
    UPDATE tracks SET
      inicio = @inicio, intro = @intro, mix = @mix, outro = @outro, fin = @fin,
      db_level = @db_level, peak_db = @peak_db, duration = @duration, analyzed = 1
    WHERE file_path = @file_path
  `).run({ file_path: filePath, ...analysisData });
}

function getTrackCount() {
  return getDB().prepare('SELECT COUNT(*) as count FROM tracks').get().count;
}

function getGenres() {
  return getDB().prepare('SELECT DISTINCT genre FROM tracks WHERE genre IS NOT NULL ORDER BY genre').all().map(r => r.genre);
}

// --- FOLDERS ---
function upsertFolder(folderPath, trackCount) {
  getDB().prepare(`
    INSERT INTO library_folders (folder_path, last_scan, track_count)
    VALUES (?, ?, ?)
    ON CONFLICT(folder_path) DO UPDATE SET last_scan = excluded.last_scan, track_count = excluded.track_count
  `).run(folderPath, new Date().toISOString(), trackCount);
}

function getFolders() {
  return getDB().prepare('SELECT * FROM library_folders ORDER BY folder_path').all();
}

// --- SETTINGS ---
function getLibrarySetting(key, defaultValue = null) {
  const row = getDB().prepare('SELECT value FROM library_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setLibrarySetting(key, value) {
  getDB().prepare(`
    INSERT INTO library_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), new Date().toISOString());
}

function closeDB() {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch(e) {}
    db = null;
  }
}

module.exports = {
  initLibraryDB,
  getDB,
  upsertTrack,
  upsertTracks,
  getTrack,
  searchTracks,
  getUnanalyzedTracks,
  updateTrackAnalysis,
  getTrackCount,
  getGenres,
  upsertFolder,
  getFolders,
  getLibrarySetting,
  setLibrarySetting,
  closeDB
};
