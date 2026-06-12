import React, { useState, useEffect, useRef } from 'react';
import styles from './CircularVumeter.module.css';

export default function CircularVumeter({ audioContext, emissionNode, localNode, isDocked, onToggleDock }) {
  const [levels, setLevels] = useState({ emission: 0, local: 0 });
  const requestRef = useRef(null);
  
  const analyserEmRef = useRef(null);
  const analyserLocRef = useRef(null);

  // Posición flotante
  const [pos, setPos] = useState({ x: 200, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!audioContext || !emissionNode || !localNode) return;

    const analyserEm = audioContext.createAnalyser();
    analyserEm.fftSize = 256;
    emissionNode.connect(analyserEm);
    analyserEmRef.current = analyserEm;

    const analyserLoc = audioContext.createAnalyser();
    analyserLoc.fftSize = 256;
    localNode.connect(analyserLoc);
    analyserLocRef.current = analyserLoc;

    const bufferLength = analyserEm.frequencyBinCount;
    const dataEm = new Uint8Array(bufferLength);
    const dataLoc = new Uint8Array(bufferLength);

    const update = () => {
      analyserEm.getByteFrequencyData(dataEm);
      analyserLoc.getByteFrequencyData(dataLoc);

      const getAvg = (arr) => {
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += arr[i];
        return Math.min((sum / bufferLength) / 128, 1);
      };
      
      setLevels({
        emission: getAvg(dataEm),
        local: getAvg(dataLoc)
      });
      
      requestRef.current = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(requestRef.current);
  }, [audioContext, emissionNode, localNode]);

  const handleMouseDown = (e) => {
    if (isDocked) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const rWeb = 40;
  const rLoc = 32;
  const circWeb = 2 * Math.PI * rWeb;
  const circLoc = 2 * Math.PI * rLoc;

  if (isDocked) {
    return (
      <div className={styles.dockedContainer}>
        <div className={styles.dockedBars}>
          <div className={styles.dockedBarLabel}>WEB</div>
          <div className={styles.dockedBar}>
            <div className={styles.dockedFillWeb} style={{ width: `${levels.emission * 100}%` }} />
          </div>
          <div className={styles.dockedBarLabel}>LOC</div>
          <div className={styles.dockedBar}>
            <div className={styles.dockedFillLoc} style={{ width: `${levels.local * 100}%` }} />
          </div>
        </div>
        <button className={styles.unDockBtn} onClick={onToggleDock}>⇖</button>
      </div>
    );
  }

  const isHot = levels.emission > 0.7 || levels.local > 0.7;

  return (
    <div 
      className={styles.floatingWrapper} 
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={handleMouseDown}
    >
      <div className={`${styles.orb} ${isHot ? styles['orb--pulse'] : ''}`}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          {/* Anillo WEB (Exterior) */}
          <circle className={styles.bgCircle} cx="50" cy="50" r={rWeb} />
          <circle 
            className={styles.levelCircleWeb} 
            cx="50" cy="50" r={rWeb}
            strokeDasharray={circWeb}
            strokeDashoffset={circWeb - levels.emission * circWeb}
          />
          {/* Anillo LOCAL (Interior) */}
          <circle className={styles.bgCircle} cx="50" cy="50" r={rLoc} />
          <circle 
            className={styles.levelCircleLoc} 
            cx="50" cy="50" r={rLoc}
            strokeDasharray={circLoc}
            strokeDashoffset={circLoc - levels.local * circLoc}
          />
        </svg>
        <div className={styles.orbLabel}>DUAL VU</div>
        <button className={styles.dockBtn} onClick={(e) => { e.stopPropagation(); onToggleDock(); }}>⤓ ACOPLAR</button>
      </div>
    </div>
  );
}
