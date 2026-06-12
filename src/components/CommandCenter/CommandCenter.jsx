import React, { useState, useEffect } from 'react';
import styles from './CommandCenter.module.css';

import CircularVumeter from '../CircularVumeter/CircularVumeter.jsx';

// Consola de Comandos conectada al Cerebro de Python (FastAPI)
export default function CommandCenter({ 
  onCommand, 
  externalAnnouncement, 
  tracks = [], 
  currentIndex = 0,
  isVuDocked,
  onToggleVuDock,
  onOpenCrossfade,
  onOpenAds,
  nextTrack,
  audioContext,
  emissionNode,
  localNode
}) {
  const [inputVal, setInputVal] = useState('');
  const [lastResponse, setLastResponse] = useState('SISTEMA: Conectando con el Cerebro...');
  const [isAlert, setIsAlert] = useState(false);
  const [brainStatus, setBrainStatus] = useState(null);

  // 1. TELEMETRÍA: Consulta periódica al Cerebro Nativo
  useEffect(() => {
    const fetchStatus = () => {
      const data = {
        project: "ksm-aircontrol",
        status: "online"
      };
      setBrainStatus(data);
      
      // Solo actualizamos el texto si NO hay un anuncio externo ocupando la pantalla
      if (!externalAnnouncement) {
        setIsAlert(false);
        const remainingTracks = tracks.slice(currentIndex + 1);
        setLastResponse(`🧠 CEREBRO NATIVO | Proyecto: ${data.project} | ${remainingTracks.length} en cola.`);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [externalAnnouncement, tracks, currentIndex]);

  // 2. MONITOREO DE ANUNCIOS EXTERNOS
  useEffect(() => {
    if (externalAnnouncement) {
      setIsAlert(false);
      setLastResponse(`${externalAnnouncement}`);
    }
  }, [externalAnnouncement]);

  // 3. ENVÍO DE COMANDOS AL CEREBRO
  const handleSubmit = async (e) => {
    e.preventDefault();
    const query = inputVal.trim();
    if (!query) return;

    setLastResponse(`🧠 Cerebro procesando: "${query}"...`);
    setInputVal('');

    try {
      if (window.electron) {
        const config = await window.electron.ipcRenderer.invoke('db-get-config');
        const geminiApiKey = config?.geminiApiKey || '';

        const data = await window.electron.ipcRenderer.invoke('cognitive-agent-query', {
          query,
          geminiApiKey,
          tracksCount: tracks.length
        });
        
        setLastResponse(data.response);
        if (data.response.includes('[CMD:PLAY]')) {
          window.dispatchEvent(new CustomEvent('ksm-brain-play'));
        }
        if (data.response.includes('[CMD:STOP]')) {
          window.dispatchEvent(new CustomEvent('ksm-brain-stop'));
        }
        if (data.response.includes('[CMD:ANNOUNCE_TIME]')) {
          window.dispatchEvent(new CustomEvent('ksm-brain-announce-time'));
        }
        const skinMatch = data.response.match(/\[CMD:CHANGE_SKIN:\s*([^\]\s]+)\]/);
        if (skinMatch) {
          const newSkin = skinMatch[1].trim();
          if (['studio-dark', 'radioboss-silver', 'salamandra-blue', 'cyber-neon'].includes(newSkin)) {
            localStorage.setItem('ksm_skin', newSkin);
            document.documentElement.setAttribute('data-skin', newSkin);
            window.dispatchEvent(new CustomEvent('ksm-skin-changed', { detail: newSkin }));
          }
        }
      } else {
        setLastResponse('❌ Error: El entorno nativo de Electron no está disponible.');
      }
    } catch (err) {
      setLastResponse(`❌ Error de comunicación cognitiva: ${err.message}`);
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.brand}>
        <span className={styles.label}>CEREBRO CENTRAL</span>
        <span className={`${styles.badge} ${brainStatus ? styles['badge--online'] : styles['badge--offline']}`}>
          {brainStatus ? 'CONECTADO' : 'OFFLINE'}
        </span>
      </div>

      <div className={styles.skinContainer}>
        <button className={styles.skinBtn} onClick={onOpenCrossfade}>
          🎚️ CROSSFADE
        </button>
        <button 
          className={styles.skinBtn} 
          onClick={onOpenAds}
          title="Abrir programador de tandas comerciales"
        >
          📢 TANDAS
        </button>
      </div>

      <div className={`${styles.response} ${isAlert ? styles['response--alert'] : ''}`}>
        <div className={styles.indicator} />
        <span className={styles.responseText}>{lastResponse}</span>
      </div>

      {isVuDocked && (
        <div className={styles.dockedRightArea}>
          <div className={styles.nextTrackBox}>
            <span className={styles.nextTrackLabel}>SIGUE:</span>
            <div className={styles.marqueeContainer}>
              <span className={styles.marqueeText}>{nextTrack ? nextTrack.title : 'FIN DE LISTA'}</span>
            </div>
          </div>
          <div className={styles.vumeterDock}>
            <CircularVumeter 
              isDocked={true} 
              onToggleDock={onToggleVuDock}
              audioContext={audioContext}
              emissionNode={emissionNode}
              localNode={localNode}
            />
          </div>
        </div>
      )}
    </div>
  );
}
