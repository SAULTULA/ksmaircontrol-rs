import React, { useState, useEffect } from 'react';
import styles from './Sidebar.module.css';
import Mixer from '../Mixer/Mixer.jsx';
import OutputProcessor from '../OutputProcessor/OutputProcessor.jsx';
import ConfigPanel from '../ConfigPanel/ConfigPanel.jsx';

const electron = window.electron || (window.require ? window.require('electron') : null);

export default function Sidebar({ 
  onAddTrack, 
  onInjectAdBlock, 
  onSkinChange, 
  onBgChange,
  activeTab,
  setActiveTab,
  audioContext,
  mixerDestination,
  outputSettings,
  setOutputSettings
}) {
  const [currentSkin, setCurrentSkin] = useState(localStorage.getItem('ksm_skin') || 'studio-dark');

  useEffect(() => {
    const handleSkinChanged = (e) => {
      setCurrentSkin(e.detail);
    };
    window.addEventListener('ksm-skin-changed', handleSkinChanged);
    return () => {
      window.removeEventListener('ksm-skin-changed', handleSkinChanged);
    };
  }, []);

  const handleSkinChange = (newSkin) => {
    setCurrentSkin(newSkin);
    localStorage.setItem('ksm_skin', newSkin);
    document.documentElement.setAttribute('data-skin', newSkin);
    if (onSkinChange) onSkinChange(newSkin);
  };

  const openDialog = async (options) => {
    if (!electron) return { canceled: true };
    return await electron.ipcRenderer.invoke('open-file-dialog', options);
  };

  const handleBgChange = async () => {
    const result = await openDialog({
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'png', 'jpeg', 'webp'] }],
      title: 'Seleccionar Imagen de Fondo'
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const bgPath = result.filePaths[0];
    localStorage.setItem('ksm_custom_bg', bgPath);
    if (onBgChange) onBgChange(bgPath);
  };

  return (
    <div className={styles.sidebarWrapper}>
      <div className={styles.sidebar__tabs}>
        <button className={`${styles.sidebar__tabBtn} ${activeTab === 'mixer' ? styles['sidebar__tabBtn--active'] : ''}`} onClick={() => setActiveTab('mixer')}>ENTRADAS</button>
        <button className={`${styles.sidebar__tabBtn} ${activeTab === 'outputs' ? styles['sidebar__tabBtn--active'] : ''}`} onClick={() => setActiveTab('outputs')}>SALIDAS</button>
      </div>

      <div className={styles.sidebar__content}>
        <div className={`${styles.sidebar__tabContent} ${activeTab !== 'mixer' ? styles['sidebar__tabContent--hidden'] : ''}`}>
          <Mixer audioContext={audioContext} mixerDestination={mixerDestination} />
        </div>

        <div className={`${styles.sidebar__tabContent} ${activeTab !== 'outputs' ? styles['sidebar__tabContent--hidden'] : ''}`}>
          <OutputProcessor settings={outputSettings} onChange={setOutputSettings} />
        </div>

      </div>
    </div>
  );
}
