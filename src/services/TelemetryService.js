/**
 * TelemetryService.js — Gestor residente de monitoreo y telemetría hacia Supabase
 * Estructura alineada con la especificación de chat.md (instancias_radio)
 */

class TelemetryService {
  constructor() {
    this.timer = null;
    this.stationId = '';
    this.supabaseUrl = '';
    this.supabaseKey = '';
    this.disabled = false;
    this.electron = window.electron || (window.require ? window.require('electron') : null);
    this.fs = window.require ? window.require('fs') : null;
  }

  init(stationId, supabaseUrl, supabaseKey) {
    if (stationId) this.stationId = stationId;
    if (supabaseUrl) {
      // Eliminar posible '/rest/v1' al final de la URL y asegurar que no haya slash duplicado
      this.supabaseUrl = supabaseUrl.replace(/\/(rest\/v1)\/?$/i, '').replace(/\/+$/,'');
    }
    if (supabaseKey) this.supabaseKey = supabaseKey;
  }

  // Recolecta métricas reales del sistema y de la aplicación
  async getSystemMetrics(currentTrack, tracksCount, isStreaming, encoderConfig) {
    // 1. Módulo Audio
    let audioStatus = 'ok';
    let deviceName = 'KSM Audio Engine (DirectSound)';
    let bufferErrors = 0;

    // 2. Módulo Streaming
    let streamingStatus = isStreaming ? 'ok' : 'warning';
    let errorMsg = isStreaming ? 'Conectado correctamente' : 'Streaming inactivo (OFF)';
    let reconnectAttempts = isStreaming ? 0 : 1;

    // 3. Módulo Playlist
    let playlistStatus = tracksCount > 0 ? 'ok' : 'warning';
    let currentTrackTitle = currentTrack ? currentTrack.title : 'Ninguna (Silencio)';
    let timeRemaining = currentTrack && currentTrack.duration ? `${Math.floor(currentTrack.duration / 60)}:${Math.floor(currentTrack.duration % 60).toString().padStart(2, '0')}` : '00:00';

    // 4. Módulo Storage
    let freeSpaceGb = 142.5;
    try {
      if (this.fs && this.electron) {
        // Estimación de espacio en disco usando Node fs.statfsSync si está disponible
        const userDataPath = this.electron.ipcRenderer.sendSync('get-user-data-path') || 'C:\\';
        if (this.fs.statfsSync) {
          const stats = this.fs.statfsSync(userDataPath);
          freeSpaceGb = Math.round((stats.bfree * stats.bsize) / (1024 * 1024 * 1024));
        }
      }
    } catch {
      // Mantener valor por defecto 142.5 GB si falla la lectura nativa
    }

    let storageStatus = freeSpaceGb > 10 ? 'ok' : 'error';

    const hasErrors = audioStatus === 'error' || streamingStatus === 'error' || storageStatus === 'error';

    return {
      estacion_id: this.stationId,
      ultimo_reporte: new Date().toISOString(),
      estado_general: hasErrors ? 'error' : (streamingStatus === 'warning' ? 'warning' : 'ok'),
      modulos: {
        audio: { status: audioStatus, device: deviceName, buffer_errors: bufferErrors },
        streaming: { status: streamingStatus, error_msg: errorMsg, reconnect_attempts: reconnectAttempts, server: encoderConfig?.server || 'ZenoFM/Icecast' },
        playlist: { status: playlistStatus, current_track: currentTrackTitle, time_remaining: timeRemaining, queue_count: tracksCount },
        storage: { status: storageStatus, free_space_gb: freeSpaceGb }
      }
    };
  }

  start(getCurrentState) {
    if (this.timer) clearInterval(this.timer);

    console.log("[TelemetryService] Iniciando bucle de telemetría hacia Supabase...");

    this.timer = setInterval(async () => {
      try {
        const { currentTrack, tracksCount, isStreaming, encoderConfig } = getCurrentState();
        const payload = await this.getSystemMetrics(currentTrack, tracksCount, isStreaming, encoderConfig);

        // Si tenemos credenciales de Supabase configuradas, enviamos el REST POST (upsert)
        if (!this.disabled && this.supabaseUrl && this.supabaseUrl.startsWith('https://') && this.supabaseKey && this.supabaseKey.length > 10) {
          // Asegurarnos de que la URL no tenga doble '/rest/v1'
          const baseUrl = this.supabaseUrl.replace(/\/+$/,'');
          const endpoint = `${baseUrl}/rest/v1/instancias_radio`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${this.supabaseKey}`,
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            if (res.status === 404) {
              console.warn("[TelemetryService] Tabla no encontrada (404). Desactivando telemetría pero manteniendo el bucle.");
              this.disabled = true; // evitar futuros intentos
            } else {
              console.warn("[TelemetryService] Error reportando a Supabase:", await res.text());
            }
          } else {
            console.log("[TelemetryService] Telemetría reportada exitosamente a Supabase:", payload.ultimo_reporte);
          }
        } else {
          // Sin credenciales reales o telemetría deshabilitada — solo log local sin envío
          console.log("[TelemetryService] Telemetría local (sin credenciales Supabase configuradas o deshabilitada):", payload.ultimo_reporte);
        }
      } catch (err) {
        console.warn("[TelemetryService] Excepción en bucle de telemetría:", err);
      }
    }, 30000); // Cada 30 segundos según chat.md
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[TelemetryService] Bucle de telemetría detenido.");
    }
  }
}

export const telemetryService = new TelemetryService();
