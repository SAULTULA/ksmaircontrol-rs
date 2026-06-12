import React, { useState } from 'react';
import styles from './CrossfadeConfig.module.css';

export default function CrossfadeConfig({ settings, onSave, onClose }) {
  const [localSettings, setLocalSettings] = useState(settings || { mode: 'smart', duration: 5 });

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.configCard}>
        <div className={styles.header}>
          <h3>🎚️ CONFIGURACIÓN DE CRUCE (CROSSFADE)</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <label>MODO DE TRANSICIÓN</label>
            <div className={styles.modeGroup}>
              <button 
                className={`${styles.modeBtn} ${localSettings.mode === 'smart' ? styles.active : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, mode: 'smart' })}
              >
                INTELIGENTE (AUTO)
              </button>
              <button 
                className={`${styles.modeBtn} ${localSettings.mode === 'manual' ? styles.active : ''}`}
                onClick={() => setLocalSettings({ ...localSettings, mode: 'manual' })}
              >
                MANUAL
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <label>TIEMPO DE SOLAPAMIENTO</label>
            
            {/* INDICADOR GIGANTE DE SEGUNDOS */}
            <div className={styles.hugeSecondsDisplay}>
              <span className={styles.hugeNumber}>{localSettings.duration}</span>
              <span className={styles.hugeLabel}>SEGUNDOS</span>
            </div>

            <input 
              type="range" 
              min="0" 
              max="15" 
              step="1"
              value={localSettings.duration}
              onChange={(e) => setLocalSettings({ ...localSettings, duration: parseInt(e.target.value) })}
              className={styles.slider}
            />
            <div className={styles.sliderLabels}>
              <span>Corte Seco (0s)</span>
              <span>Cruce Largo (15s)</span>
            </div>
          </div>

          <div className={styles.infoBox}>
            <strong>ℹ️ ¿Cómo funciona?</strong>
            <p>
              {localSettings.mode === 'smart' 
                ? `El sistema iniciará el fundido automáticamente ${localSettings.duration} segundos antes de que termine la canción actual.`
                : `Tú decides el momento exacto del fundido usando el botón de disparo manual.`}
            </p>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>CANCELAR</button>
          <button className={styles.saveBtn} onClick={() => onSave(localSettings)}>GUARDAR CAMBIOS</button>
        </div>
      </div>
    </div>
  );
}
