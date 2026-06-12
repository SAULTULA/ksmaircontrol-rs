import React, { useState, useEffect, useRef } from 'react';
import styles from './MainPlayer.module.css';
import { resolveAudioUrl } from '../../utils/audioUrl';

export default function MainPlayer({ 
  currentTrack, 
  nextTrack, 
  onTrackComplete, 
  isMicDucking,
  showDSP,
  onCloseDSP,
  audioContext,
  mixerDestination,
  crossfadeSettings = { mode: 'smart', duration: 5 },
  supabaseUrl
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // ARRASTRE Y FLOTACIÓN
  const [isFloating, setIsFloating] = useState(() => localStorage.getItem('ksm_player_floating') !== 'false');
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('ksm_player_pos');
    return saved ? JSON.parse(saved) : { x: window.innerWidth / 2 - 240, y: 150 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const offset = useRef({ x: 0, y: 0 });

  // VOLUMEN DEL REPRODUCTOR
  const [playerVolume, setPlayerVolume] = useState(() => {
    const saved = localStorage.getItem('ksm_player_vol');
    return saved !== null ? parseFloat(saved) : 1.0;
  });

  // MOTOR DUAL (CROSSFADE ENGINE)
  // Usamos dos slots de audio para permitir el solapamiento (cruce)
  const deck1 = useRef({ audio: new Audio(), gain: null, source: null, trackId: null });
  const deck2 = useRef({ audio: new Audio(), gain: null, source: null, trackId: null });
  const activeDeckRef = useRef(1); // 1 o 2
  const isTransitioningRef = useRef(false);

  // Inicializar Nodos de Audio y Analizadores para detección inteligente
  useEffect(() => {
    if (audioContext && mixerDestination && !deck1.current.gain) {
      [deck1.current, deck2.current].forEach(deck => {
        deck.source = audioContext.createMediaElementSource(deck.audio);
        deck.gain = audioContext.createGain();
        deck.analyser = audioContext.createAnalyser();
        deck.analyser.fftSize = 256; // Pequeño para mejor rendimiento
        
        deck.source.connect(deck.gain);
        deck.source.connect(deck.analyser); // Conectar al analizador
        deck.gain.connect(mixerDestination);
        deck.gain.gain.value = 1.0;
      });
    }
  }, [audioContext, mixerDestination]);

  // Efecto de Ducking para Mics/Carts (afecta a ambos platos) + Control de Volumen
  useEffect(() => {
    if (audioContext && deck1.current.gain && deck2.current.gain) {
      const targetVol = (isMicDucking ? 0.2 : 1.0) * playerVolume;
      const time = audioContext.currentTime;
      deck1.current.gain.gain.setTargetAtTime(targetVol, time, 0.1);
      deck2.current.gain.gain.setTargetAtTime(targetVol, time, 0.1);
    }
  }, [isMicDucking, audioContext, playerVolume]);

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setPlayerVolume(v);
    localStorage.setItem('ksm_player_vol', v.toString());
  };

  // ESCUCHADOR DE TIEMPO Y GESTIÓN DE CROSSFADE INTELIGENTE
  useEffect(() => {
    const monitorTime = () => {
      const activeDeck = activeDeckRef.current === 1 ? deck1.current : deck2.current;
      const audio = activeDeck.audio;
      
      if (!audio.paused) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration || 0);
        setProgress((audio.currentTime / audio.duration) * 100 || 0);

        // Lógica de Disparo de Crossfade
        if (!isTransitioningRef.current && nextTrack) {
          
          if (crossfadeSettings.mode === 'manual') {
            // Modo Manual: Tiempo fijo ciego
            const triggerTime = audio.duration - crossfadeSettings.duration;
            if (audio.currentTime >= triggerTime) {
              console.log("[Crossfade] Disparo Manual por tiempo fijo.");
              startCrossfade();
            }
          } else {
            // Modo Inteligente: Detección de silencio al final
            // Solo empezamos a escuchar el silencio en los últimos 15 segundos
            const secondsLeft = audio.duration - audio.currentTime;
            if (secondsLeft <= 15 && activeDeck.analyser) {
              const dataArray = new Uint8Array(activeDeck.analyser.frequencyBinCount);
              activeDeck.analyser.getByteTimeDomainData(dataArray);
              
              // Calcular el volumen promedio (RMS)
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const v = (dataArray[i] - 128) / 128;
                sum += v * v;
              }
              const rms = Math.sqrt(sum / dataArray.length);
              
              // Si el volumen cae por debajo del 2% (silencio o fade out)
              if (rms < 0.02 && secondsLeft <= 10) {
                console.log("[Crossfade] ¡Silencio detectado! Disparando cruce inteligente.");
                startCrossfade(3); // Aplica 3 segundos de fundido automático
              } 
              // Fallback por si no hay silencio: disparar de todos modos al límite
              else if (secondsLeft <= 1.5) {
                console.log("[Crossfade] Fallback inteligente por fin de tiempo.");
                startCrossfade(1.5); // Fundido rápido de salida
              }
            }
          }
        }
      }
    };

    const interval = setInterval(monitorTime, 200);
    return () => clearInterval(interval);
  }, [nextTrack, crossfadeSettings]);

  const startCrossfade = (overrideDuration = null) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const ctx = audioContext;
    const now = ctx.currentTime;
    const fadeTime = overrideDuration !== null ? overrideDuration : crossfadeSettings.duration;

    const outgoing = activeDeckRef.current === 1 ? deck1.current : deck2.current;
    const incoming = activeDeckRef.current === 1 ? deck2.current : deck1.current;

    // 1. Fade Out Plato Actual
    outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
    outgoing.gain.gain.linearRampToValueAtTime(0, now + fadeTime);

    // 2. Preparar Plato Siguiente (incoming)
    // Notificamos a App que cambie el track (esto actualizará currentTrack vía props)
    // Pero como necesitamos cargar el SIGUIENTE track ahora mismo:
    if (onTrackComplete) onTrackComplete();

    // Cambiamos el deck activo
    activeDeckRef.current = activeDeckRef.current === 1 ? 2 : 1;

    // Limpiamos flag después del fade
    setTimeout(() => {
      outgoing.audio.pause();
      outgoing.audio.currentTime = 0;
      // Restaurar el volumen al nivel configurado por el usuario en vez de 1.0
      const targetVol = (isMicDucking ? 0.2 : 1.0) * playerVolume;
      outgoing.gain.gain.setValueAtTime(targetVol, ctx.currentTime); 
      isTransitioningRef.current = false;
    }, fadeTime * 1000 + 100);
  };

  // Carga de Track (cuando cambia currentTrack por props)
  useEffect(() => {
    if (currentTrack) {
      const activeDeck = activeDeckRef.current === 1 ? deck1.current : deck2.current;
      
      // Si el track ya está cargado en este plato, no hacemos nada
      if (activeDeck.trackId === currentTrack.id) return;

      let url = '';
      if (currentTrack.nativeFile && currentTrack.nativeFile instanceof Blob) {
        url = URL.createObjectURL(currentTrack.nativeFile);
      } else if (currentTrack.filePath) {
        url = resolveAudioUrl(currentTrack.filePath, supabaseUrl);
      }

      if (url) {
        activeDeck.trackId = currentTrack.id;
        activeDeck.audio.src = url;
        
        // Evitar que el reproductor se trabe si el archivo no existe o tiene caracteres raros
        activeDeck.audio.onerror = () => {
          console.error('[MainPlayer] Error crítico cargando archivo:', url);
          if (onTrackComplete) onTrackComplete(); // Saltar pista automáticamente
        };

        activeDeck.audio.load();
        
        if (isPlaying) {
          activeDeck.audio.play().catch(console.error);
        }

        if (currentTrack.nativeFile) {
          return () => URL.revokeObjectURL(url);
        }
      }
    }
  }, [currentTrack]);

  // Eventos Globales (Play/Stop del Cerebro)
  useEffect(() => {
    const handlePlay = () => setIsPlaying(true);
    const handleStop = () => {
      setIsPlaying(false);
      deck1.current.audio.pause();
      deck2.current.audio.pause();
    };
    window.addEventListener('ksm-brain-play', handlePlay);
    window.addEventListener('ksm-brain-stop', handleStop);
    return () => {
      window.removeEventListener('ksm-brain-play', handlePlay);
      window.removeEventListener('ksm-brain-stop', handleStop);
    };
  }, []);

  useEffect(() => {
    const activeDeck = activeDeckRef.current === 1 ? deck1.current : deck2.current;
    if (isPlaying) activeDeck.audio.play().catch(() => {});
    else activeDeck.audio.pause();
  }, [isPlaying]);

  // Draggable logic
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    setIsDragging(true);
    offset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const newPos = { x: e.clientX - offset.current.x, y: e.clientY - offset.current.y };
      setPosition(newPos);
    };
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        localStorage.setItem('ksm_player_pos', JSON.stringify(position));
      }
    };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  const formatTime = (seconds) => {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e) => {
    const activeDeck = activeDeckRef.current === 1 ? deck1.current : deck2.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * activeDeck.audio.duration;
    activeDeck.audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipForward = () => {
    const activeDeck = activeDeckRef.current === 1 ? deck1.current : deck2.current;
    activeDeck.audio.currentTime = Math.min(activeDeck.audio.duration, activeDeck.audio.currentTime + 10);
  };

  // RENDER DOCKED
  if (!isFloating) {
    return (
      <div className={`${styles.playerWrapper} ${styles['player--docked']}`}>
        <div className={styles.dockedStrip}>
          <div className={styles.statusMini}>
            <div className={styles.status__dot} style={{ backgroundColor: isPlaying ? 'var(--color-onair)' : '#444', color: isPlaying ? 'var(--color-onair)' : '#444' }} />
            <span className={styles.status__text}>{isPlaying ? 'AIRE' : 'STOP'}</span>
          </div>
          <div className={styles.trackInfoMini}>
            <span className={styles.trackTitleMini}>{currentTrack ? currentTrack.title : 'ESPERANDO PISTA...'}</span>
            <span className={styles.trackArtistMini}>• {currentTrack ? currentTrack.artist : 'VACÍA'}</span>
          </div>
          <div className={styles.timerMini}>-{formatTime(duration - currentTime)}</div>
          <div className={styles.controlsMini}>
            <button className={styles.playBtnMini} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</button>
            <button className={styles.stopBtnMini} onClick={() => { activeDeckRef.current === 1 ? (deck1.current.audio.currentTime = 0) : (deck2.current.audio.currentTime = 0); setIsPlaying(false); }}>■</button>
            <button className={styles.seekBtnMini} onClick={skipForward}>+10</button>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: '10px' }}>
              <span style={{ fontSize: '14px', marginRight: '5px' }}>🔈</span>
              <input type="range" min="0" max="1" step="0.01" value={playerVolume} onChange={handleVolumeChange} style={{ width: '60px', accentColor: 'var(--color-brand)' }} />
            </div>
          </div>
          <div className={styles.progressMini} onClick={handleSeek} style={{ cursor: 'pointer' }}>
            <div className={styles.progressBarMini}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
          </div>
          <button className={styles.dockBtnMini} onClick={() => { setIsFloating(true); localStorage.setItem('ksm_player_floating', 'true'); }} title="Flotar">🗗 FLOTAR</button>
        </div>
      </div>
    );
  }

  // RENDER FLOATING
  return (
    <div className={`${styles.playerWrapper} ${styles['player--floating']}`} style={{ left: position.x, top: position.y }} onMouseDown={handleMouseDown}>
      <div className={styles.dragHint}>::: KSM AIRCONTROL - REPRODUCTOR DUAL CROSSFADE :::</div>
      <div className={styles.player__header}>
        <div className={styles.status}>
          <div className={styles.status__dot} style={{ backgroundColor: isPlaying ? 'var(--color-onair)' : '#444' }} />
          <span className={styles.status__text}>{isPlaying ? 'AIRE' : 'STOP'}</span>
        </div>
        <div className={styles.trackInfo}>
          <h2 className={styles.trackTitle}>{currentTrack ? currentTrack.title : 'ESPERANDO PISTA...'}</h2>
          <p className={styles.trackArtist}>{currentTrack ? currentTrack.artist : 'PLAYLIST VACÍA'}</p>
        </div>
        <button className={styles.dockBtn} onClick={() => { setIsFloating(false); localStorage.setItem('ksm_player_floating', 'false'); }}>📌 ACOPLAR</button>
      </div>
      <div className={styles.player__body}>
        <div className={styles.timer}>
          <span className={styles.timer__label}>TIEMPO RESTANTE</span>
          <span className={styles.timer__value}>-{formatTime(duration - currentTime)}</span>
        </div>
        <div className={styles.controls}>
          <button className={styles.playBtn} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? '⏸' : '▶'}</button>
          <button className={styles.stopBtn} onClick={() => setIsPlaying(false)}>■</button>
          <button className={styles.seekBtn} onClick={skipForward} title="Adelantar 10 segundos">⏩ +10s</button>
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '15px', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '18px', marginRight: '8px' }}>🔈</span>
            <input type="range" min="0" max="1" step="0.01" value={playerVolume} onChange={handleVolumeChange} style={{ width: '80px', accentColor: 'var(--color-brand)' }} />
          </div>
          <div className={styles.volumeContainer}><span className={styles.volHint}>CROSSFADE: {crossfadeSettings.mode.toUpperCase()} ({crossfadeSettings.duration}s)</span></div>
        </div>
      </div>
      <div className={styles.player__progress} onClick={handleSeek} style={{ cursor: 'pointer' }}>
        <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
      </div>
      <div className={styles.player__footer}>
        <span className={styles.nextLabel}>SIGUE:</span>
        <span className={styles.nextTrack}>{nextTrack ? nextTrack.title : 'FIN DE PAUTA'}</span>
      </div>
    </div>
  );
}
