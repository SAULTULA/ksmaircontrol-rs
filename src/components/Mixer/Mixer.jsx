import React, { useState, useEffect, useRef } from 'react';
import styles from './Mixer.module.css';
import { webRTCReceiver } from '../../services/WebRTCReceiver.js';

export default function Mixer({ audioContext, mixerDestination }) {
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [channels, setChannels] = useState([
    { id: 0, name: 'MIC 1 (LOCUTOR)', volume: 1.0, pan: 0, deviceId: '', active: false, muted: true },
    { id: 1, name: 'MIC 2 (INVITADO)', volume: 1.0, pan: 0, deviceId: '', active: false, muted: true }
  ]);

  // ESTADO DEL MÓVIL EXTERIOR (WebRTC Live Link)
  const [mobileStatus, setMobileStatus] = useState('offline');
  const [mobileVol, setMobileVol] = useState(0.8);
  const [mobileMuted, setMobileMuted] = useState(true);

  // NODOS DE AUDIO WEB API
  const audioNodesRef = useRef([
    { source: null, gainNode: null, pannerNode: null, stream: null },
    { source: null, gainNode: null, pannerNode: null, stream: null }
  ]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter(d => d.kind === 'audioinput');
        // Deduplicar por nombre limpio
        const seen = new Set();
        const uniqueInputs = [];
        audioInputs.forEach(d => {
          const cleanName = d.label ? d.label.replace(/\s*\([^)]*\)\s*$/, '') : `Micrófono ${d.deviceId.substr(0, 5)}`;
          if (!seen.has(cleanName)) {
            seen.add(cleanName);
            uniqueInputs.push({ id: d.deviceId, name: d.label || cleanName });
          }
        });
        setDevices({ inputs: uniqueInputs, outputs: [] });
      } catch (err) {
        console.warn("[Mixer] Error enumerando dispositivos:", err);
      }
    };
    fetchDevices();
  }, []);

  useEffect(() => {
    if (!audioContext || !mixerDestination) {
      console.log("[Mixer] Esperando AudioContext y MasterBus...", { audioContext: !!audioContext, mixerDestination: !!mixerDestination });
      return;
    }
    
    console.log("[Mixer] Inicializando WebRTCReceiver con AudioContext:", audioContext.state);
    webRTCReceiver.init(audioContext, mixerDestination, (status) => {
      console.log("[Mixer] Estado móvil cambiado a:", status);
      setMobileStatus(status);
    });
    
    // El Agente Headless maneja la señalización y envía comandos por API local
    const handleWebRTCState = (e) => {
      console.log("[Mixer] Estado WebRTC remoto:", e.detail);
      setMobileStatus(e.detail);
    };
    window.addEventListener('ksm-webrtc-state', handleWebRTCState);

    return () => {
      window.removeEventListener('ksm-webrtc-state', handleWebRTCState);
    };
  }, [audioContext, mixerDestination]);

  const checkDucking = (chans, mobMuted = mobileMuted) => {
    const isAnyActive = chans.some(c => c.active && !c.muted) || (mobileStatus === 'online' && !mobMuted);
    window.dispatchEvent(new CustomEvent('ksm-mic-ducking', { detail: isAnyActive }));
  };

  const handleDeviceSelect = async (idx, deviceId) => {
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const node = audioNodesRef.current[idx];
    if (node.source) { node.source.disconnect(); node.source = null; }
    if (node.stream) { node.stream.getTracks().forEach(t => t.stop()); node.stream = null; }

    const newChannels = [...channels];
    newChannels[idx].deviceId = deviceId;
    newChannels[idx].active = deviceId !== '';
    newChannels[idx].muted = true; // Inicia en MUTE por requerimiento del usuario
    setChannels(newChannels);
    checkDucking(newChannels);

    if (deviceId !== '' && audioContext && mixerDestination) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
        node.stream = stream;
        node.source = audioContext.createMediaStreamSource(stream);
        node.gainNode = audioContext.createGain();
        node.pannerNode = audioContext.createStereoPanner();

        node.gainNode.gain.value = 0; // Muted inicialmente
        node.pannerNode.pan.value = newChannels[idx].pan;

        node.source.connect(node.gainNode);
        node.gainNode.connect(node.pannerNode);
        node.pannerNode.connect(mixerDestination);
      } catch (err) {
        console.error("[Mixer] Error abriendo micro:", err);
        alert("No se pudo acceder al micrófono. Verifique los permisos.");
      }
    }
  };

  const handleToggleMute = async (idx) => {
    if (audioContext && audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const newChannels = [...channels];
    const isNowMuted = !newChannels[idx].muted;
    newChannels[idx].muted = isNowMuted;
    setChannels(newChannels);

    const node = audioNodesRef.current[idx];
    if (node.gainNode) {
      node.gainNode.gain.value = isNowMuted ? 0 : newChannels[idx].volume;
    }
    checkDucking(newChannels, mobileMuted);
  };

  const handleMobileToggleMute = () => {
    const isNowMuted = !mobileMuted;
    setMobileMuted(isNowMuted);
    const volToAgent = isNowMuted ? 0 : mobileVol;
    fetch(`http://localhost:9001/?action=setvolume&vol=${volToAgent}`).catch(() => {});
    checkDucking(channels, isNowMuted);
  };

  const handleVolumeChange = (idx, vol) => {
    const newChannels = [...channels];
    newChannels[idx].volume = vol;
    setChannels(newChannels);

    const node = audioNodesRef.current[idx];
    if (node.gainNode && !newChannels[idx].muted) {
      node.gainNode.gain.value = vol;
    }
  };

  const handlePanChange = (idx, pan) => {
    const newChannels = [...channels];
    newChannels[idx].pan = pan;
    setChannels(newChannels);

    const node = audioNodesRef.current[idx];
    if (node.pannerNode) {
      node.pannerNode.pan.value = pan;
    }
  };

  return (
    <div className={styles.mixerWrapper}>
      <div className={styles.mixerHeader}>
        <span className={styles.headerTitle}>MIXER</span>
      </div>

      <div className={styles.channelsGrid}>
        {channels.map((chan, idx) => (
          <div key={chan.id} className={`${styles.channelStrip} ${chan.active && !chan.muted ? styles.active : ''}`}>
            <div className={styles.micIcon}>🎙️</div>
            <span className={styles.chanName}>{chan.name}</span>
            
            <select 
              className={styles.inputSelector}
              value={chan.deviceId} 
              onChange={(e) => handleDeviceSelect(idx, e.target.value)}
            >
              <option value="">NINGUNO</option>
              {devices.inputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <div className={styles.panner}>
              <label>PAN</label>
              <input type="range" min="-1" max="1" step="0.1" value={chan.pan} onChange={(e) => handlePanChange(idx, parseFloat(e.target.value))} />
              <div className={styles.panVal}>{chan.pan === 0 ? 'C' : chan.pan > 0 ? 'R' : 'L'}</div>
            </div>

            <div className={styles.faderWrapper}>
              <input 
                type="range" 
                className={styles.fader}
                min="0" max="2" step="0.01" 
                value={chan.volume} 
                onChange={(e) => handleVolumeChange(idx, parseFloat(e.target.value))}
              />
              <div className={styles.volLabel}>{Math.round(chan.volume * 100)}%</div>
            </div>

            <button 
              className={`${styles.muteBtn} ${chan.muted ? styles.muted : ''} ${chan.active && !chan.muted ? styles.btnOn : ''}`}
              onClick={() => handleToggleMute(idx)}
              disabled={!chan.active}
            >
              {chan.muted ? 'MUTE' : 'ON'}
            </button>
          </div>
        ))}

        {/* CANAL DEDICADO: MÓVIL EXTERIOR WEBRTC */}
        <div className={`${styles.channelStrip} ${mobileStatus === 'online' && !mobileMuted ? styles.active : ''}`}>
          <div className={styles.micIcon}>📡</div>
          <span className={styles.chanName}>MÓVIL EXT</span>
          
          <div className={`${styles.channelStrip__mobileBadge} ${mobileStatus === 'online' ? styles['channelStrip__mobileBadge--online'] : ''}`}>
            {mobileStatus === 'online' ? 'EN VIVO' : 'OFFLINE'}
          </div>

          <div className={styles.panner} style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Espacio reservado si se requiere otro control futuro */}
          </div>

          <div className={styles.faderWrapper}>
            <input 
              type="range" 
              className={styles.fader}
              min="0" max="2" step="0.01" 
              value={mobileVol} 
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setMobileVol(v);
                if (!mobileMuted) fetch(`http://localhost:9001/?action=setvolume&vol=${v}`).catch(() => {});
              }}
            />
            <div className={styles.volLabel}>{Math.round(mobileVol * 100)}%</div>
          </div>

          <button 
            className={`${styles.muteBtn} ${mobileMuted ? styles.muted : ''} ${mobileStatus === 'online' && !mobileMuted ? styles.btnOn : ''}`}
            onClick={handleMobileToggleMute}
            disabled={mobileStatus !== 'online'}
          >
            {mobileMuted ? 'MUTE' : 'ON'}
          </button>
        </div>
      </div>
    </div>
  );
}
