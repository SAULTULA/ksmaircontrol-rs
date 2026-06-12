import React from 'react';
import styles from './OutputProcessor.module.css';

export default function OutputProcessor({ settings, onChange }) {
  const PRESETS = {
    FLAT: { eqLow: 0, eqMid: 0, eqHigh: 0, compression: false },
    RADIO: { eqLow: 4, eqMid: -1, eqHigh: 3.5, compression: true },
    VOICE: { eqLow: 2, eqMid: 4, eqHigh: 1, compression: true }
  };

  const handleChange = (key, val) => {
    onChange({ ...settings, [key]: val });
  };

  const applyPreset = (presetName) => {
    onChange({ ...settings, ...PRESETS[presetName] });
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>PRESETS DE AUDIO RÁPIDOS</span>
        <div className={styles.presetGrid}>
          <button className={styles.presetBtn} onClick={() => applyPreset('FLAT')}>PLANO</button>
          <button className={styles.presetBtn} onClick={() => applyPreset('RADIO')}>RADIO AIRE</button>
          <button className={styles.presetBtn} onClick={() => applyPreset('VOICE')}>PODCAST/VOZ</button>
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>VOLUMEN DE MONITOREO (LOCAL)</span>
        <div className={styles.controlRow}>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={settings.localVolume} 
            onChange={(e) => handleChange('localVolume', parseFloat(e.target.value))} 
            className={styles.slider}
          />
          <span className={styles.value}>{Math.round(settings.localVolume * 100)}%</span>
        </div>
        <p className={styles.hint}>Este volumen afecta solo a tus parlantes/estudio.</p>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>VOLUMEN DE EMISIÓN (MASTER)</span>
        <div className={styles.controlRow}>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={settings.emissionVolume} 
            onChange={(e) => handleChange('emissionVolume', parseFloat(e.target.value))} 
            className={styles.slider}
          />
          <span className={styles.value}>{Math.round(settings.emissionVolume * 100)}%</span>
        </div>
        <p className={styles.hint}>Este volumen es el que sale al AIRE (Zeno/Icecast).</p>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionTitle}>ECUALIZADOR PROFESIONAL (DSP)</span>
        <div className={styles.eqGrid}>
          <div className={styles.eqCol}>
            <label>LOW</label>
            <input 
              type="range" min="-12" max="12" step="0.5" orient="vertical"
              value={settings.eqLow} 
              onChange={(e) => handleChange('eqLow', parseFloat(e.target.value))} 
              className={styles.vSlider}
            />
            <span>{settings.eqLow}dB</span>
          </div>
          <div className={styles.eqCol}>
            <label>MID</label>
            <input 
              type="range" min="-12" max="12" step="0.5" orient="vertical"
              value={settings.eqMid} 
              onChange={(e) => handleChange('eqMid', parseFloat(e.target.value))} 
              className={styles.vSlider}
            />
            <span>{settings.eqMid}dB</span>
          </div>
          <div className={styles.eqCol}>
            <label>HIGH</label>
            <input 
              type="range" min="-12" max="12" step="0.5" orient="vertical"
              value={settings.eqHigh} 
              onChange={(e) => handleChange('eqHigh', parseFloat(e.target.value))} 
              className={styles.vSlider}
            />
            <span>{settings.eqHigh}dB</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.switchRow}>
          <span className={styles.sectionTitle}>COMPRESIÓN / LIMITADOR</span>
          <button 
            className={`${styles.switch} ${settings.compression ? styles['switch--on'] : ''}`}
            onClick={() => handleChange('compression', !settings.compression)}
          >
            {settings.compression ? 'ACTIVO' : 'BYPASS'}
          </button>
        </div>
      </div>
    </div>
  );
}
