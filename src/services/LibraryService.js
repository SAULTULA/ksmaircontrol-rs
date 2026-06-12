/**
 * LibraryService.js
 * Servicio de acceso a la Librería Musical SQLite desde el Renderer (React).
 * Adaptado del motor de LF-Automatizador para KSM AirControl.
 * 
 * USO:
 *   import { libraryService } from './LibraryService.js';
 *   const tracks = await libraryService.search({ query: 'Shakira', genre: 'Pop' });
 */

const ipc = window.electron?.ipcRenderer || window.electronAPI;

const invoke = (channel, ...args) => {
  if (!ipc) return Promise.resolve(null);
  return ipc.invoke(channel, ...args);
};

export const libraryService = {

  // --- LIBRERÍA ---

  /** Buscar pistas: { query, genre, limit, offset } */
  search: (params) => invoke('library:search', params),

  /** Estadísticas: total de pistas, géneros, carpetas escaneadas */
  stats: () => invoke('library:stats'),

  /** Obtener datos completos de una pista por su ruta de archivo */
  getTrack: (filePath) => invoke('library:get-track', filePath),

  /** Guardar o actualizar una pista en la librería */
  upsertTrack: (track) => invoke('library:upsert-track', track),

  /** Guardar múltiples pistas de golpe */
  upsertTracks: (tracks) => invoke('library:upsert-tracks', tracks),

  // --- ESCANEO ---

  /**
   * Abre un selector de carpeta y escanea todos los MP3/audio en ella.
   * Retorna: { success, folder, count }
   */
  scanFolder: () => invoke('library:scan-folder'),

  // --- ANÁLISIS FFmpeg (asíncrono, con eventos) ---

  /**
   * Inicia el análisis FFmpeg de las pistas pendientes en background.
   * Los resultados llegan como eventos 'library:analysis-event'.
   * Retorna: { success, queued }
   */
  analyzePending: (options) => invoke('library:analyze-pending', options),

  /** Cancela el análisis FFmpeg en curso */
  cancelAnalysis: () => invoke('library:cancel-analysis'),

  // --- SETTINGS ---

  /** Obtener un setting de la librería */
  getSetting: (key) => invoke('library:get-setting', key),

  /** Guardar un setting de la librería */
  setSetting: (key, value) => invoke('library:set-setting', key, value),

  // --- EVENTOS en tiempo real ---

  /**
   * Suscribirse a los eventos del worker de análisis FFmpeg.
   * Tipos de evento: 'queued', 'result', 'finished', 'cancelled'
   * 
   * Ejemplo de uso:
   *   const unsub = libraryService.onAnalysisEvent((msg) => {
   *     if (msg.type === 'result') console.log('Analizado:', msg.payload.filePath);
   *     if (msg.type === 'finished') console.log('¡Análisis completado!');
   *   });
   *   // Llama a unsub() para dejar de escuchar.
   */
  onAnalysisEvent: (callback) => {
    if (!ipc) return () => {};
    const handler = (event, msg) => callback(msg);
    ipc.on('library:analysis-event', handler);
    // Retorna función para desuscribirse
    return () => {
      try { window.electron?.ipcRenderer?.removeListener?.('library:analysis-event', handler); } catch(e) {}
    };
  }
};

export default libraryService;
