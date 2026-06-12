import React, { useState, useEffect, useRef } from 'react';
import styles from './Header.module.css';
import packageJson from '../../../package.json';

export default function Header({ 
  onTriggerTimeAnnouncement, 
  isRecording,
  onToggleRecording,
  onOpenDSP,
  onOpenConfig,
  onStreamingStateChange,
  autoTimeAnnounce,
  onToggleAutoTime,
  onToggleFloatingPanel,
  isFloatingOpen
}) {
  const mountedRef = useRef(false);
  const [timeStr, setTimeStr] = useState('');
  const [msStr, setMsStr] = useState('');
  
  const electron = window.electron || (window.require ? window.require('electron') : null);

  const [currentCity, setCurrentCity] = useState(localStorage.getItem('ksm_city') || 'BUENOS AIRES');
  const [temp, setTemp] = useState(localStorage.getItem('ksm_temp') || '22');
  const [humidity, setHumidity] = useState(localStorage.getItem('ksm_hum') || '60');
  

  const [showEncoder, setShowEncoder] = useState(false);
  const [encoderTab, setEncoderTab] = useState('main');
  const [isStreaming, setIsStreaming] = useState(false);
  const [encoderConfig, setEncoderConfig] = useState({
    server: 'streaming.ksm.com',
    port: '8000',
    mount: '/live',
    pass: '',
    codec: 'mp3',
    bitrate: '128'
  });

  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-config').then(savedConfig => {
        if (savedConfig && savedConfig.encoder) {
          setEncoderConfig({
            server: savedConfig.encoder.server || 'streaming.ksm.com',
            port: savedConfig.encoder.port || '8000',
            mount: savedConfig.encoder.mount || '/live',
            pass: savedConfig.encoder.pass || '',
            codec: savedConfig.encoder.codec || 'mp3',
            bitrate: savedConfig.encoder.bitrate || '128'
          });
        }
      });
    }

    const handleError = () => setIsStreaming(false);
    window.addEventListener('ksm-streaming-error', handleError);
    return () => window.removeEventListener('ksm-streaming-error', handleError);
  }, []);

  // OBTENCIÓN DE CLIMA REAL (Geocodificación + Clima de Open-Meteo)
  useEffect(() => {
    if (!currentCity) return;

    // Debounce de 1 segundo para no saturar la API mientras el usuario escribe
    const timer = setTimeout(() => {
      console.log(`[Clima] Buscando coordenadas para: ${currentCity}`);
      
      // 1. Buscar latitud y longitud de la ciudad
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentCity)}&count=1&language=es&format=json`)
        .then(res => res.json())
        .then(geoData => {
          if (geoData.results && geoData.results.length > 0) {
            const { latitude, longitude, name } = geoData.results[0];
            console.log(`[Clima] Encontrado: ${name} (${latitude}, ${longitude})`);
            
            // 2. Obtener el clima para esas coordenadas
            return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m`);
          }
          throw new Error("Ciudad no encontrada");
        })
        .then(res => res.json())
        .then(data => {
          if (data && data.current) {
            const t = Math.round(data.current.temperature_2m).toString();
            const h = Math.round(data.current.relative_humidity_2m).toString();
            setTemp(t);
            setHumidity(h);
            localStorage.setItem('ksm_temp', t);
            localStorage.setItem('ksm_hum', h);
          }
        })
        .catch(err => console.warn("[Clima] Error:", err.message));
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentCity]);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    onStreamingStateChange?.(isStreaming, encoderConfig);
  }, [isStreaming, encoderConfig, onStreamingStateChange]);

  const handleSaveEncoder = () => {
    setShowEncoder(false);
    if (electron) {
      electron.ipcRenderer.invoke('db-get-config').then(savedConfig => {
        const newConfig = { ...savedConfig, encoder: encoderConfig };
        electron.ipcRenderer.invoke('db-save-config', newConfig);
      });
    }
  };


  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('es-AR', { hour12: false }));
      setMsStr(Math.floor(now.getMilliseconds() / 10).toString().padStart(2, '0'));
    }, 40);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className={styles.header}>
      {/* 1. SECCIÓN MARCA */}
      <div className={styles.sectionBrand}>
        <div className={styles.logoBox}>KSM</div>
        <div className={styles.titles}>
          <div className={styles.titleRow}>
            <h1 className={styles.mainTitle}>AirControl</h1>
            <span className={styles.versionBadge}>v{packageJson.version}</span>
          </div>
          <span className={styles.subTitle}>STUDIO BROADCAST</span>
        </div>
      </div>

      {/* 2. SECCIÓN CONTROLES CENTRALES */}
      <div className={styles.sectionControls}>
        <button className={`${styles.btnRec} ${isRecording ? styles['btnRec--on'] : ''}`} onClick={onToggleRecording}>
          ● REC
        </button>

        <div className={styles.toolGroup}>
          <button className={styles.btnTool} onClick={onOpenConfig}>⚙️ CONFIG</button>
          <button className={styles.btnTool} onClick={() => setShowEncoder(!showEncoder)}>🌐 ENCODER</button>
          <button 
            className={styles.btnTool} 
            onClick={onToggleFloatingPanel}
            style={{ backgroundColor: isFloatingOpen ? 'var(--color-danger)' : undefined }}
          >
            {isFloatingOpen ? '🪟 CERRAR FLOTANTE' : '🪟 FLOTANTE'}
          </button>
          <button className={`${styles.btnStream} ${isStreaming ? styles['btnStream--on'] : ''}`} onClick={() => setIsStreaming(!isStreaming)}>
            {isStreaming ? 'AIRE (ON)' : 'AIRE (OFF)'}
          </button>
        </div>
      </div>

      {/* 3. SECCIÓN TELEMETRÍA Y HORA */}
      <div className={styles.sectionTelemetry}>
        <div className={styles.weatherBox}>
          <input 
            type="text" 
            className={styles.inputCity} 
            value={currentCity} 
            onChange={(e) => { setCurrentCity(e.target.value); localStorage.setItem('ksm_city', e.target.value); }} 
          />
          <div className={styles.weatherRow}>
            <input type="text" className={styles.inputSmall} value={temp} onChange={(e) => { setTemp(e.target.value); localStorage.setItem('ksm_temp', e.target.value); }} />
            <span className={styles.unit}>°C</span>
            <input type="text" className={styles.inputSmall} value={humidity} onChange={(e) => { setHumidity(e.target.value); localStorage.setItem('ksm_hum', e.target.value); }} />
            <span className={styles.unit}>%H</span>
          </div>
        </div>

        <div className={styles.clockBox}>
          <div className={styles.timeRow}>
            <span className={styles.timeMain}>{timeStr}</span>
            <span className={styles.timeMs}>{msStr}</span>
          </div>
          <div className={styles.voiceControls}>
            <button 
              className={`${styles.btnAuto} ${autoTimeAnnounce ? styles['btnAuto--on'] : ''}`}
              onClick={onToggleAutoTime}
              title="Locución automática al inicio de cada hora"
            >
              AUTO
            </button>
            <button className={styles.btnVoice} onClick={() => onTriggerTimeAnnouncement?.(currentCity, temp, humidity)}>
              🔊 HORA Y CLIMA
            </button>
          </div>
        </div>
      </div>

      {/* MODAL ENCODER (LEGENDARY butt BROADCAST EDITION) */}
      {showEncoder && (
        <div className={styles.buttModal}>
          <div className={styles.buttHeader}>
            <div className={styles.buttBrand}>
              <span className={styles.buttTitle}>KSM AIRCONTROL</span>
              <span className={styles.buttSubtitle}>LIVE BROADCAST ENCODER</span>
            </div>
            <button className={styles.buttClose} onClick={() => setShowEncoder(false)}>✕</button>
          </div>

          {/* THE FAMOUS butt LCD DISPLAY */}
          <div className={styles.buttLCD}>
            <div className={styles.lcdRow}>
              <span className={styles.lcdLabel}>STATUS:</span>
              <span className={styles.lcdValue} style={{ color: isStreaming ? '#10b981' : '#ef4444' }}>
                {isStreaming ? 'ON AIR (STREAMING ACTIVE)' : 'IDLE (DISCONNECTED)'}
              </span>
            </div>
            <div className={styles.lcdRow}>
              <span className={styles.lcdLabel}>SERVER:</span>
              <span className={styles.lcdValue}>{encoderConfig.server}:{encoderConfig.port}{encoderConfig.mount}</span>
            </div>
            <div className={styles.lcdRow}>
              <span className={styles.lcdLabel}>CODEC:</span>
              <span className={styles.lcdValue}>
                {(() => {
                  const labels = {
                    mp3: 'MP3 (MPEG-1 Layer III)',
                    aac: 'AAC / AAC+',
                    ogg: 'Ogg / Vorbis',
                    webm: 'WebM / Opus'
                  };
                  return `${labels[encoderConfig.codec] || encoderConfig.codec?.toUpperCase() || 'MP3'} @ ${encoderConfig.bitrate || 128}kbps (Stereo)`;
                })()}
              </span>
            </div>
          </div>

          {/* THE FAMOUS butt BIG SQUARE BUTTONS */}
          <div className={styles.buttActions}>
            <button 
              className={`${styles.buttBtnPlay} ${isStreaming ? styles['buttBtnPlay--active'] : ''}`}
              onClick={() => setIsStreaming(true)}
              title="Start Streaming"
            >
              ▶
            </button>
            <button 
              className={styles.buttBtnStop}
              onClick={() => setIsStreaming(false)}
              title="Stop Streaming"
            >
              ■
            </button>
          </div>

          {/* THE butt CONFIGURATION TABS */}
          <div className={styles.buttTabs}>
            <button className={`${styles.buttTab} ${encoderTab === 'main' ? styles['buttTab--active'] : ''}`} onClick={() => setEncoderTab('main')}>[ Main ]</button>
            <button className={`${styles.buttTab} ${encoderTab === 'audio' ? styles['buttTab--active'] : ''}`} onClick={() => setEncoderTab('audio')}>[ Audio ]</button>
            <button className={`${styles.buttTab} ${encoderTab === 'stream' ? styles['buttTab--active'] : ''}`} onClick={() => setEncoderTab('stream')}>[ Stream ]</button>
          </div>

          <div className={styles.buttTabContent}>
            {encoderTab === 'main' && (
              <div className={styles.buttFormGroup}>
                <label>Servidor Icecast / Shoutcast:</label>
                <input type="text" value={encoderConfig.server} onChange={e => setEncoderConfig(prev => ({...prev, server: e.target.value}))} className={styles.buttInput} />
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label>Puerto:</label>
                    <input type="text" value={encoderConfig.port} onChange={e => setEncoderConfig(prev => ({...prev, port: e.target.value}))} className={styles.buttInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Punto de Montaje (Mount):</label>
                    <input type="text" value={encoderConfig.mount} onChange={e => setEncoderConfig(prev => ({...prev, mount: e.target.value}))} className={styles.buttInput} />
                  </div>
                </div>

                <label style={{ marginTop: '8px' }}>Contraseña de Origen (Source Pass):</label>
                <input type="password" value={encoderConfig.pass} onChange={e => setEncoderConfig(prev => ({...prev, pass: e.target.value}))} className={styles.buttInput} />
                
                <button className={styles.buttSaveBtn} onClick={handleSaveEncoder}>GUARDAR CONFIGURACIÓN</button>
              </div>
            )}

            {encoderTab === 'audio' && (
              <div className={styles.buttFormGroup}>
                <label>Formato de Captura y Codificación (Codec):</label>
                <select 
                  value={encoderConfig.codec || 'mp3'} 
                  onChange={e => setEncoderConfig(prev => ({...prev, codec: e.target.value}))} 
                  className={styles.buttSelect}
                >
                  <option value="mp3">MP3 (MPEG-1 Audio Layer III - ZenoFM/Icecast Compatible)</option>
                  <option value="aac">AAC / AAC+ (Advanced Audio Coding - Alta Eficiencia)</option>
                  <option value="ogg">Ogg / Vorbis (Icecast 2 Nativo)</option>
                  <option value="webm">WebM / Opus (Baja Latencia Web Audio API)</option>
                </select>

                <label style={{ marginTop: '10px' }}>Tasa de Bits (Bitrate):</label>
                <select 
                  value={encoderConfig.bitrate || '128'} 
                  onChange={e => setEncoderConfig(prev => ({...prev, bitrate: e.target.value}))} 
                  className={styles.buttSelect}
                >
                  <option value="64">64 kbps (AAC+ / Mono Estándar)</option>
                  <option value="128">128 kbps (MP3 Stereo Premium - Recomendado ZenoFM)</option>
                  <option value="192">192 kbps (Studio Master FM)</option>
                  <option value="320">320 kbps (Lossless Hi-Fi Broadcast)</option>
                </select>
                <small style={{ color: '#888', marginTop: '5px', display: 'block' }}>
                  El motor emite las cabeceras nativas para que ZenoFM y Shoutcast reconozcan el flujo instantáneamente.
                </small>
              </div>
            )}

            {encoderTab === 'stream' && (
              <div className={styles.buttFormGroup}>
                <label>Nombre de la Estación (Icecast Name):</label>
                <input type="text" defaultValue="KSM AirControl Master Broadcast" className={styles.buttInput} />

                <label style={{ marginTop: '10px' }}>Género de la Estación:</label>
                <input type="text" defaultValue="Live Studio Broadcast" className={styles.buttInput} />

                <label style={{ marginTop: '10px' }}>Descripción / Metadatos:</label>
                <input type="text" defaultValue="Transmisión oficial generada por KSM AirControl Studio" className={styles.buttInput} />
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
