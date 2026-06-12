/**
 * Scheduler.js — Orquestador de pautas, separaciones y automatización
 * Inspirado en la lógica de colas de RadioDJ.
 */

export class Scheduler {
  /**
   * Valida si una pista puede ser insertada cumpliendo las reglas de separación
   * @param {Object} track - Pista candidata
   * @param {Array} historyLogs - Historial de pistas pasadas
   * @param {number} minSeparationMinutes - Minutos de separación por artista
   */
  static canPlayArtist(track, historyLogs, minSeparationMinutes = 60) {
    if (!historyLogs || historyLogs.length === 0) return true;
    const cutoffTime = Date.now() - (minSeparationMinutes * 60 * 1000);
    
    for (let i = historyLogs.length - 1; i >= 0; i--) {
      const log = historyLogs[i];
      if (log.playedAt < cutoffTime) break; // Ya pasó el umbral crítico
      if (log.artist.toLowerCase().trim() === track.artist.toLowerCase().trim()) {
        return false; // Artista repetido en el lapso prohibido
      }
    }
    return true;
  }

  /**
   * Calcula el punto exacto de disparo del Crossfade basándose en la duración de Intro y Fin
   * @param {number} totalDurationSecs - Duración en segundos
   * @param {number} fadeDurationSecs - Duración del fundido
   */
  static calculateMixPoint(totalDurationSecs, fadeDurationSecs = 4) {
    return Math.max(0, totalDurationSecs - fadeDurationSecs);
  }
}
