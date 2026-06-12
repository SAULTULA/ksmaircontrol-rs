import React, { useState, useEffect } from 'react';
import styles from './NativeMonitor.module.css';

export default function NativeMonitor() {
  const [status, setStatus] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (window.electron) {
          const data = await window.electron.ipcRenderer.invoke('get-streaming-status');
          if (data && data.audio_engine) {
            setStatus(data.audio_engine);
          }
        }
      } catch (err) {
        setStatus(null);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  return (
    <div className={styles.container}>
      <button 
        className={`${styles.toggleBtn} ${status.streaming ? styles['toggleBtn--active'] : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {status.streaming ? '⚙️ NATIVE ENGINE: ON AIR' : '⚙️ NATIVE ENGINE: IDLE'}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span>FFMPEG NATIVE BROADCAST ENGINE</span>
            <button onClick={() => setIsOpen(false)}>✕</button>
          </div>
          
          <div className={styles.lcd}>
            <div className={styles.row}>
              <span className={styles.label}>CORE STATUS:</span>
              <span className={styles.value} style={{ color: status.streaming ? '#10b981' : '#f59e0b' }}>
                {status.streaming ? 'RUNNING (C++)' : 'READY / WAITING'}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>DRIVER:</span>
              <span className={styles.value}>{status.engine}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>LATENCY:</span>
              <span className={styles.value}>{status.streaming ? 'ULTRA LOW (< 5ms)' : '---'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>AUDIO PIPE:</span>
              <span className={styles.value}>PCM_S16LE 44100Hz</span>
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.led} style={{ backgroundColor: status.streaming ? '#10b981' : '#333' }} />
            <span>REAL-TIME STREAMING ACTIVE</span>
          </div>
        </div>
      )}
    </div>
  );
}
