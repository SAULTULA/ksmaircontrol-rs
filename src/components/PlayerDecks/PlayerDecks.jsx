import React, { useState, useEffect } from 'react';
import styles from './PlayerDecks.module.css';

// Subcomponente individual para representar un Deck (Reproductor Profesional)
function Deck({ label, track, isActive, isPlaying, onTogglePlay }) {
  const [progress, setProgress] = useState(0); // Porcentaje de reproducción (0 a 100)
  const [volume, setVolume] = useState(100);

  // Simulación dinámica de avance de la pista en tiempo real
  useEffect(() => {
    let timer;
    if (isPlaying && track) {
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            onTogglePlay(); // Detiene al llegar al 100%
            return 0;
          }
          // Avanza en base a la duración real de la pista
          return prev + (100 / (track.duration * 4));
        });
      }, 250);
    }
    return () => clearInterval(timer);
  }, [isPlaying, track, onTogglePlay]);

  // Si cambia la pista cargada, resetea el progreso
  useEffect(() => {
    setProgress(0);
  }, [track]);

  // Formateo estricto MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsedSeconds = track ? (progress / 100) * track.duration : 0;
  const remainingSeconds = track ? track.duration - elapsedSeconds : 0;

  // Renderiza barras simulando una forma de onda cargada en memoria
  const renderWaveBars = () => {
    const bars = [];
    // Usamos el ID del track como semilla para que la onda sea constante
    const seed = track ? track.duration : 100;
    for (let i = 0; i < 60; i++) {
      const height = 10 + Math.floor(Math.sin((i + seed) * 0.3) * 15) + Math.floor(Math.cos(i * 0.7) * 10);
      bars.push(
        <div 
          key={i} 
          style={{
            flex: 1,
            height: `${Math.min(40, Math.max(4, height))}px`,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            margin: '0 1px',
            borderRadius: '1px'
          }}
        />
      );
    }
    return bars;
  };

  return (
    <div className={`${styles.deck} ${isActive ? styles['deck--active'] : ''}`}>
      <div className={styles.deck__header}>
        <div>
          <span className={`${styles.deck__status} ${isPlaying ? styles['deck__status--playing'] : (track ? styles['deck__status--loaded'] : '')}`}>
            {label} • {isPlaying ? 'PLAYING' : (track ? 'READY' : 'EMPTY')}
          </span>
          <div className={styles.deck__meta}>
            <span className={styles.deck__title}>{track ? track.title : 'Sin Pista Cargada'}</span>
            <span className={styles.deck__artist}>{track ? track.artist : '---'}</span>
          </div>
        </div>

        <div className={styles.deck__timers}>
          <div>{formatDuration(remainingSeconds)}</div>
        </div>
      </div>

      {/* Visualizador de Forma de Onda (Waveform) con Puntos de Automatización */}
      <div className={styles.deck__waveform}>
        <div className={styles.deck__waveProgress} style={{ width: `${progress}%` }} />
        
        {/* Marcador Intro (Simulado al 10%) */}
        {track && <div className={`${styles.deck__cueMarker} ${styles['deck__cueMarker--intro']}`} style={{ left: '10%' }} title="Intro End" />}
        {/* Marcador Mix/Fade (Simulado al 88%) */}
        {track && <div className={`${styles.deck__cueMarker} ${styles['deck__cueMarker--mix']}`} style={{ left: '88%' }} title="Mix Point" />}

        {renderWaveBars()}
      </div>

      {/* Controles de Transporte y Fader de Volumen Individual */}
      <div className={styles.deck__controls}>
        <div className={styles.deck__btnGroup}>
          <button 
            className={`${styles.deck__btn} ${isPlaying ? styles['deck__btn--stop'] : styles['deck__btn--play']}`}
            onClick={onTogglePlay}
            disabled={!track}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>
          <button className={styles.deck__btn} disabled={!track}>CUE</button>
          <button className={styles.deck__btn} disabled={!track}>FADE</button>
        </div>

        <div className={styles.deck__fader}>
          <span>VOL</span>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className={styles.deck__faderInput} 
          />
          <span>{volume}%</span>
        </div>
      </div>
    </div>
  );
}

export default function PlayerDecks({ trackA, trackB, activeDeck, onDeckSwitch }) {
  const [isPlayingA, setIsPlayingA] = useState(true); // Inicia sonando Deck A
  const [isPlayingB, setIsPlayingB] = useState(false);

  // Simula el cruce (Crossfade) automático entre Decks al finalizar
  const handleToggleA = () => {
    setIsPlayingA(!isPlayingA);
    if (!isPlayingA) setIsPlayingB(false); // Apaga el B si prendo manual el A
  };

  const handleToggleB = () => {
    setIsPlayingB(!isPlayingB);
    if (!isPlayingB) setIsPlayingA(false);
  };

  return (
    <div className={styles.decksWrapper}>
      <Deck 
        label="DECK A" 
        track={trackA} 
        isActive={activeDeck === 'A'} 
        isPlaying={isPlayingA}
        onTogglePlay={handleToggleA}
      />
      <Deck 
        label="DECK B" 
        track={trackB} 
        isActive={activeDeck === 'B'} 
        isPlaying={isPlayingB}
        onTogglePlay={handleToggleB}
      />
    </div>
  );
}
