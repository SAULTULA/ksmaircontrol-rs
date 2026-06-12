/**
 * WebRTCReceiver.js — Puente de señalización y recepción de audio WebRTC para enlaces móviles en vivo
 */

class WebRTCReceiver {
  constructor() {
    this.peerConnection = null;
    this.audioElement = null;
    this.mediaStream = null;
    this.gainNode = null;
    this.audioContext = null;
    this.isConnected = false;
    this.onStatusChange = null;
  }

  init(audioContext, mixerDestination, onStatusChange) {
    this.audioContext = audioContext;
    this.onStatusChange = onStatusChange;

    if (this.audioContext) {
      if (!this.gainNode) {
        // Primera vez: crear el nodo y conectarlo
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0.8;
        if (mixerDestination) {
          this.gainNode.connect(mixerDestination);
          this._connectedDestination = mixerDestination;
          console.log("[WebRTCReceiver] GainNode creado y conectado al MasterBus.");
        }
      } else if (mixerDestination && mixerDestination !== this._connectedDestination) {
        // Nueva llamada con distinto destino: conectar al nuevo (sin desconectar el antiguo)
        this.gainNode.connect(mixerDestination);
        this._connectedDestination = mixerDestination;
        console.log("[WebRTCReceiver] GainNode conectado a nuevo MasterBus.");
      }
    }
  }

  setVolume(volume) {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
    }
  }

  async startSignaling(stationId, supabaseClient) {
    if (!supabaseClient) {
      console.error("[WebRTCReceiver] No se puede iniciar señalización sin cliente Supabase.");
      return;
    }

    console.log("[WebRTCReceiver] Iniciando canal de señalización real para:", stationId);
    
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Canal de Supabase para el Handshake
    const signalingChannel = supabaseClient.channel(`signaling:${stationId}`);

    // Escuchamos ofertas del móvil
    signalingChannel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      console.log("[WebRTCReceiver] Oferta recibida del móvil. Generando respuesta...");
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Enviamos la respuesta de vuelta al móvil
      signalingChannel.send({
        type: 'broadcast',
        event: 'answer',
        payload: { sdp: answer }
      });
    });

    // Escuchamos candidatos ICE del móvil
    signalingChannel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      if (payload.candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.warn("[WebRTCReceiver] Error añadiendo candidato ICE:", e);
        }
      }
    });

    // Enviamos nuestros candidatos ICE al móvil
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { candidate: event.candidate }
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log("[WebRTCReceiver] ¡ENLACE ESTABLECIDO! Stream de audio recibido.");
      this.mediaStream = event.streams[0];
      this.isConnected = true;
      this.onStatusChange?.('online');

      if (this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }

        if (this._remoteAudio) {
          this._remoteAudio.pause();
          this._remoteAudio.srcObject = null;
        }

        this._remoteAudio = new Audio();
        this._remoteAudio.srcObject = this.mediaStream;
        
        // Silenciamos el elemento HTML para que el audio NO salga directo por los parlantes.
        // Esto evita que suene a volumen 100% y permite que el Web Audio API tome el control total.
        this._remoteAudio.muted = true; 

        // Capturar el stream CRUDO en lugar del elemento
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        if (this.gainNode) {
          source.connect(this.gainNode); // → Va al MasterBus/Mixer
          console.log("[WebRTCReceiver] Audio del móvil (StreamSource) ruteado con éxito al Mixer.");
        } else {
          source.connect(this.audioContext.destination);
          console.warn("[WebRTCReceiver] Sin GainNode, saliendo directo a destination.");
        }

        this._remoteAudio.play()
          .then(() => console.log("[WebRTCReceiver] Elemento de soporte iniciado."))
          .catch(e => console.error("[WebRTCReceiver] Error play():", e));
      }
    };

    // Detectar desconexion del móvil
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection.iceConnectionState;
      console.log("[WebRTCReceiver] Estado ICE:", state);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        this.onStatusChange?.('offline');
        console.log("[WebRTCReceiver] Móvil desconectado. Estado reseteado a offline.");
      }
    };

    signalingChannel.subscribe((status) => {
      console.log("[WebRTCReceiver] Estado del canal de señalización:", status);
    });
  }

  // Permite simular la conexión de un móvil para pruebas en el estudio
  simulateMobileConnection() {
    if (this.isConnected) {
      this.isConnected = false;
      this.onStatusChange?.('offline');
      console.log("[WebRTCReceiver] Simulación detenida.");
      return;
    }

    console.log("[WebRTCReceiver] Simulando conexión de móvil exterior en vivo...");
    this.isConnected = true;
    this.onStatusChange?.('online');
    
    if (this.audioContext && this.gainNode) {
      const time = this.audioContext.currentTime;
      
      // 1. Tono de prueba (Pito de retorno)
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, time);
      
      // 2. Ruido blanco (Simulación de ambiente/viento)
      const bufferSize = 2 * this.audioContext.sampleRate;
      const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.audioContext.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;
      
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500; // Filtrado para que parezca ambiente lejano

      const noiseGain = this.audioContext.createGain();
      noiseGain.gain.setValueAtTime(0.02, time); // Muy suave

      const oscGain = this.audioContext.createGain();
      oscGain.gain.setValueAtTime(0.05, time);

      osc.connect(oscGain);
      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      
      oscGain.connect(this.gainNode);
      noiseGain.connect(this.gainNode);

      osc.start();
      whiteNoise.start();

      // Detener después de 10 segundos o al desconectar (aunque esto es simulación)
      // En una implementación real, el stop vendría del evento de cierre
    }
  }

  disconnect() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.isConnected = false;
    this.onStatusChange?.('offline');
    console.log("[WebRTCReceiver] Enlace WebRTC desconectado.");
  }
}

export const webRTCReceiver = new WebRTCReceiver();
