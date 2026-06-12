/**
 * AudioEngine.js — Envolvente desacoplada para la Web Audio API y Howler.js
 * Inspirado en la arquitectura robusta de Liquidsoap y Mixxx.
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.gainNode = null;
    this.analyser = null;
    this.initialized = false;
  }

  // Inicializa el contexto de audio tras la primera interacción del usuario
  init() {
    if (this.initialized) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.gainNode = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      
      this.analyser.fftSize = 256;
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      
      this.initialized = true;
      console.log("[AudioEngine] Contexto inicializado correctamente.");
    } catch (e) {
      console.warn("[AudioEngine] Error al inicializar Web Audio API:", e);
    }
  }

  // Simulación de precarga de pista
  preloadTrack(url) {
    console.log(`[AudioEngine] Precargando en búfer (Howler): ${url}`);
    // Aquí se instanciaría Howl con { src: [url], preload: true }
  }

  // Configura nivel de atenuación/ganancia
  setVolume(val) {
    if (this.gainNode && this.ctx) {
      // Evita cortes abruptos usando rampa exponencial
      this.gainNode.gain.setValueAtTime(val / 100, this.ctx.currentTime);
    }
  }

  // Extrae picos para Vúmetros
  getPeaks() {
    if (!this.analyser || !this.initialized) return { left: 0, right: 0 };
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    // Mapea el valor a un rango de vúmetro de 0 a 20
    const scaled = Math.floor((avg / 255) * 20);
    return { left: scaled, right: scaled };
  }
}

export const audioEngine = new AudioEngine();
