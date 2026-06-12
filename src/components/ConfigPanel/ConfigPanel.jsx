import React, { useState, useEffect } from 'react';
import styles from './ConfigPanel.module.css';
import packageJson from '../../../package.json';

const electron = window.electron || (window.require ? window.require('electron') : null);

export default function ConfigPanel({ onBgChange }) {
  const [stationName, setStationName] = useState('');
  const [stationLogo, setStationLogo] = useState('');
  const [enableLogoAnimation, setEnableLogoAnimation] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [silenceDetectorEnabled, setSilenceDetectorEnabled] = useState(false);
  const [silenceDetectorTimeout, setSilenceDetectorTimeout] = useState(15);
  const [savedStatus, setSavedStatus] = useState('');
  const [locucionesPath, setLocionesPath] = useState('');
  const [locucionesStatus, setLocionesStatus] = useState('');
  const [customLibraryName, setCustomLibraryName] = useState('');
  
  // API Config
  const [apiPort, setApiPort] = useState(9000);
  const [apiPassword, setApiPassword] = useState('');

  // Perfiles
  const [profiles, setProfiles] = useState([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileActionStatus, setProfileActionStatus] = useState('');

  // Skins
  const [currentSkin, setCurrentSkin] = useState(() => localStorage.getItem('ksm_skin') || 'studio-dark');

  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-config').then(savedConfig => {
        if (savedConfig) {
          setStationName(savedConfig.stationName || '');
          setStationLogo(savedConfig.stationLogo || '');
          setEnableLogoAnimation(savedConfig.enableLogoAnimation || false);
          setGeminiApiKey(savedConfig.geminiApiKey || '');
          setSilenceDetectorEnabled(savedConfig.silenceDetectorEnabled || false);
          setSilenceDetectorTimeout(savedConfig.silenceDetectorTimeout || 15);
          setLocionesPath(savedConfig.locucionesPath || '');
          setApiPort(savedConfig.apiPort || 9000);
          setApiPassword(savedConfig.apiPassword || '');
        }
      });

      // Cargar lista de perfiles guardados
      electron.ipcRenderer.invoke('db-list-profiles').then(list => {
        setProfiles(list || []);
      });
    }
  }, []);

  const handleSave = () => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-config').then(savedConfig => {
        const newConfig = { 
          ...savedConfig, 
          stationName,
          stationLogo,
          enableLogoAnimation,
          geminiApiKey,
          silenceDetectorEnabled,
          silenceDetectorTimeout,
          apiPort,
          apiPassword
        };
        electron.ipcRenderer.invoke('db-save-config', newConfig).then(() => {
          window.dispatchEvent(new CustomEvent('ksm-config-saved', { 
            detail: newConfig 
          }));
          setSavedStatus('¡Guardado!');
          setTimeout(() => setSavedStatus(''), 2000);
        });
      });
    }
  };

  const handleSelectLocionesFolder = () => {
    if (!electron) return;
    setLocionesStatus('Abriendo explorador...');
    electron.ipcRenderer.invoke('select-locuciones-folder').then(result => {
      if (result.canceled) {
        setLocionesStatus('Cancelado.');
      } else {
        setLocionesPath(result.folder);
        const found = result.found || [];
        const missing = ['time','temperature','humidity'].filter(f => !found.includes(f));
        if (missing.length === 0) {
          setLocionesStatus(`✅ Carpeta cargada. Subcarpetas: time, temperature, humidity`);
        } else {
          setLocionesStatus(`⚠️ Cargada. Faltantes: ${missing.join(', ')}`);
        }
      }
      setTimeout(() => setLocionesStatus(''), 5000);
    });
  };

  const handleCreateProfile = () => {
    if (!newProfileName.trim()) return;
    const name = newProfileName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, ''); // Sanitizar nombre
    if (electron) {
      setProfileActionStatus('Creando copia de seguridad...');
      electron.ipcRenderer.invoke('db-create-profile', name).then(updatedList => {
        setProfiles(updatedList || []);
        setNewProfileName('');
        setProfileActionStatus('¡Copia de seguridad creada!');
        setTimeout(() => setProfileActionStatus(''), 3000);
      });
    }
  };

  const handleLoadProfile = (name) => {
    if (electron) {
      setProfileActionStatus(`Restaurando copia "${name}"...`);
      electron.ipcRenderer.invoke('db-load-profile', name).then(success => {
        if (success) {
          setProfileActionStatus('¡Estudio restaurado! Reiniciando sistema...');
          setTimeout(() => {
            window.location.reload(); // Recarga la app para levantar los nuevos archivos de base de datos
          }, 1500);
        } else {
          setProfileActionStatus('Error al restaurar el perfil.');
          setTimeout(() => setProfileActionStatus(''), 3000);
        }
      });
    }
  };

  const handleDeleteProfile = (name) => {
    if (confirm(`¿Está seguro de que desea eliminar permanentemente la copia de seguridad "${name}"?`)) {
      if (electron) {
        setProfileActionStatus(`Eliminando "${name}"...`);
        electron.ipcRenderer.invoke('db-delete-profile', name).then(updatedList => {
          setProfiles(updatedList || []);
          setProfileActionStatus('Copia de seguridad eliminada.');
          setTimeout(() => setProfileActionStatus(''), 3000);
        });
      }
    }
  };

  const handleSkinChange = (skinName) => {
    setCurrentSkin(skinName);
    localStorage.setItem('ksm_skin', skinName);
    document.documentElement.setAttribute('data-skin', skinName);
  };

  return (
    <div className={styles.configContainer}>
      <h2 className={styles.configTitle}>⚙️ CONFIGURACIÓN DE EMISORA</h2>
      <p className={styles.configSubtitle}>Personalice los datos de su estación.</p>

      <div className={styles.inputGroup}>
        <label>Nombre de la Emisora:</label>
        <input 
          type="text" 
          value={stationName} 
          onChange={(e) => setStationName(e.target.value)} 
          placeholder="Ej: KSM Radio"
          className={styles.inputField}
        />
      </div>

      <div className={styles.inputGroup}>
        <label>Logo de la Emisora:</label>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className={styles.skinBtn} 
            onClick={async () => {
              if (electron) {
                const res = await electron.ipcRenderer.invoke('open-file-dialog', { 
                  filters: [{ name: 'Imágenes', extensions: ['jpg', 'png', 'webp', 'jpeg'] }] 
                });
                if (res && !res.canceled && res.filePaths.length > 0) {
                  setStationLogo(res.filePaths[0]);
                }
              }
            }}
          >
            🖼️ Elegir Logo
          </button>
          {stationLogo && <span style={{ fontSize: '10px', color: '#10b981', wordBreak: 'break-all', flex: 1 }}>{stationLogo}</span>}
          {stationLogo && (
            <button className={styles.skinBtn} style={{ background: '#ef4444' }} onClick={() => setStationLogo('')}>🗑️</button>
          )}
        </div>
      </div>

      <div className={styles.inputGroup}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
          <input 
            type="checkbox" 
            checked={enableLogoAnimation} 
            onChange={(e) => setEnableLogoAnimation(e.target.checked)} 
          />
          Activar animación de logo flotante (latido y deslizamiento)
        </label>
      </div>

      <div className={styles.aiSection}>
        <h3 className={styles.aiSection__title}>🧠 FORTALECER CEREBRO IA</h3>
        <p className={styles.aiSection__description}>
          Conecte su API Key de Google Gemini para habilitar el asistente de IA avanzado (Cerebro Online) y resolver el tema de cerebro offline local.
        </p>
        <div className={styles.inputGroup}>
          <label>API Key de Google Gemini (AI Studio):</label>
          <input 
            type="password" 
            value={geminiApiKey} 
            onChange={(e) => setGeminiApiKey(e.target.value)} 
            placeholder="api ai studio"
            className={styles.inputField}
          />
          <small>El Cerebro utilizará esta clave de forma local y segura para responder tus preguntas y controlar la aplicación.</small>
        </div>
      </div>

      <div className={styles.inputGroup} style={{ marginTop: '20px' }}>
        <h3 style={{ color: 'var(--color-brand)', marginBottom: '8px' }}>📡 KSM REQUEST API (Para interactuar con bots/webs)</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Configura el puerto y la clave para recibir peticiones musicales automáticas desde tu Agente Request Song. (Requiere reiniciar KSM para aplicar el nuevo puerto).
        </p>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <label>Puerto API:</label>
            <input 
              type="number" 
              value={apiPort} 
              onChange={(e) => setApiPort(parseInt(e.target.value))} 
              className={styles.inputField}
              style={{ width: '100px' }}
            />
          </div>
          <div style={{ flex: 2 }}>
            <label>Contraseña (Dejar en blanco para acceso público local):</label>
            <input 
              type="password" 
              value={apiPassword} 
              onChange={(e) => setApiPassword(e.target.value)} 
              placeholder="Clave de seguridad..."
              className={styles.inputField}
            />
          </div>
        </div>
      </div>

      <div className={styles.inputGroup} style={{ marginTop: '20px', backgroundColor: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '8px' }}>
        <h3 style={{ color: 'var(--color-brand)', marginBottom: '8px' }}>📚 GENERADOR KSM LIBRARY (Para Agente Request Song)</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Crea la base de datos musical para que tu Agente sepa qué canciones tienes. Selecciona la carpeta donde guardas tu música.
        </p>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontSize: '12px', color: 'var(--color-brand)', display: 'block', marginBottom: '5px' }}>Nombre de la Librería (Opcional):</label>
          <input 
            type="text" 
            value={customLibraryName}
            onChange={(e) => setCustomLibraryName(e.target.value)}
            placeholder="Ej: Romanticos"
            className={styles.inputField}
            style={{ width: '200px', fontSize: '13px' }}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '10px' }}>Si se deja vacío, tomará el nombre de la carpeta.</span>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={styles.buttonMain} 
            onClick={() => {
              if (electron) {
                setLocionesStatus('⏳ Selecciona la carpeta de música...');
                electron.ipcRenderer.invoke('generate-ksm-library', customLibraryName).then(res => {
                  if (res.canceled) {
                    setLocionesStatus('Cancelado.');
                  } else if (res.success) {
                    setLocionesStatus(`✅ ¡Librería generada! (${res.count} pistas encontradas)`);
                    // Mostrar el path para que lo copie
                    setTimeout(() => {
                       setLocionesStatus(`👉 Copia esta ruta en tu Agente: ${res.libraryDir}`);
                    }, 2000);
                  } else {
                    setLocionesStatus(`❌ Error: ${res.error}`);
                  }
                });
              }
            }}
          >
            📁 Seleccionar Carpeta y Generar XML
          </button>
          
          <button 
            className={styles.buttonMain} 
            style={{ background: '#ef4444', flex: '0 0 auto' }}
            onClick={() => {
              if (electron && window.confirm('¿Estás seguro de que deseas eliminar todas las librerías antiguas?')) {
                electron.ipcRenderer.invoke('clear-ksm-libraries').then(res => {
                  if (res.success) {
                    setLocionesStatus(`✅ Librerías antiguas eliminadas con éxito.`);
                  } else {
                    setLocionesStatus(`❌ Error: ${res.error}`);
                  }
                });
              }
            }}
          >
            🗑️ Limpiar XMLs
          </button>
        </div>

        {locucionesStatus && (
           <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--color-brand)', wordBreak: 'break-all', userSelect: 'all', padding: '10px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
             {locucionesStatus}
           </div>
        )}
      </div>

      <div className={styles.inputGroup}>
        <h3 style={{ color: 'var(--color-brand)', marginBottom: '10px' }}>🚨 DETECTOR DE SILENCIO (Rescue Monitor)</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Reinicia la pauta automáticamente (Pista 1) si se detecta silencio absoluto en la emisión.
        </p>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={silenceDetectorEnabled} 
              onChange={(e) => setSilenceDetectorEnabled(e.target.checked)} 
            />
            Activar Detector
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: silenceDetectorEnabled ? 1 : 0.5, pointerEvents: silenceDetectorEnabled ? 'auto' : 'none' }}>
            <span style={{ fontSize: '12px' }}>Tiempo de espera:</span>
            <select 
              className={styles.inputField} 
              style={{ padding: '4px', width: '80px' }}
              value={silenceDetectorTimeout}
              onChange={(e) => setSilenceDetectorTimeout(Number(e.target.value))}
            >
              <option value={5}>5 seg</option>
              <option value={10}>10 seg</option>
              <option value={15}>15 seg</option>
              <option value={30}>30 seg</option>
              <option value={60}>60 seg</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.appearanceSection}>
        <h3 className={styles.appearanceSection__title}>🎨 APARIENCIA Y TEMAS</h3>
        <p className={styles.appearanceSection__description}>
          Cambia la estética de la aplicación al instante.
        </p>
        <div className={styles.skinSelector}>
          <button 
            className={`${styles.skinBtn} ${currentSkin === 'studio-dark' ? styles.skinBtnActive : ''}`}
            onClick={() => handleSkinChange('studio-dark')}
          >
            🌙 Studio Dark (Premium)
          </button>
          <button 
            className={`${styles.skinBtn} ${currentSkin === 'sci-fi-hud' ? styles.skinBtnActive : ''}`}
            onClick={() => handleSkinChange('sci-fi-hud')}
          >
            📡 Sci-Fi HUD Militar
          </button>
          <button 
            className={`${styles.skinBtn} ${currentSkin === 'neobrutalism' ? styles.skinBtnActive : ''}`}
            onClick={() => handleSkinChange('neobrutalism')}
          >
            🟨 Neobrutalismo
          </button>
          <button 
            className={`${styles.skinBtn} ${currentSkin === 'claymorphism' ? styles.skinBtnActive : ''}`}
            onClick={() => handleSkinChange('claymorphism')}
          >
            ☁️ Claymorphism Pastel
          </button>
        </div>

        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
          <button className={styles.skinBtn} onClick={onBgChange}>
            🖼️ Elegir Fondo Personalizado
          </button>
          <button className={styles.skinBtn} onClick={() => {
            localStorage.removeItem('ksm_custom_bg');
            window.dispatchEvent(new CustomEvent('ksm-bg-change', { detail: null }));
          }}>
            🗑️ Limpiar Fondo
          </button>
        </div>
      </div>

      <button className={styles.saveBtn} onClick={handleSave}>
        {savedStatus ? savedStatus : 'GUARDAR CONFIGURACIÓN GENERAL'}
      </button>

      {/* === LOCUCIONES === */}
      <div className={styles.inputGroup} style={{ marginTop: '20px' }}>
        <h3 style={{ color: 'var(--color-brand)', marginBottom: '8px' }}>🔊 CARPETA DE LOCUCIONES</h3>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Seleccione la carpeta que contiene las subcarpetas <strong>time</strong>, <strong>temperature</strong> y <strong>humidity</strong> con los archivos MP3 de locución horaria y clima.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className={styles.skinBtn} onClick={handleSelectLocionesFolder}>
            📂 SELECCIONAR CARPETA DE LOCUCIONES
          </button>
          {locucionesPath && (
            <span style={{ fontSize: '10px', color: '#10b981', wordBreak: 'break-all' }}>{locucionesPath}</span>
          )}
        </div>
        {locucionesStatus && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: locucionesStatus.startsWith('✅') ? '#10b981' : '#f59e0b', background: '#131917', padding: '6px 10px', borderRadius: '4px', border: '1px solid #333' }}>
            {locucionesStatus}
          </div>
        )}
      </div>

      {/* === SECCIÓN DE PERFILES Y BACKUPS === */}
      <div className={styles.profilesSection}>
        <h3 className={styles.profilesSection__title}>📁 COPIAS DE SEGURIDAD Y PERFILES</h3>
        
        {profileActionStatus && (
          <div style={{ fontSize: '11px', color: '#10b981', background: '#131917', padding: '8px', borderRadius: '4px', border: '1px solid #10b98144', textAlign: 'center' }}>
            {profileActionStatus}
          </div>
        )}

        <div className={styles.profilesSection__inputRow}>
          <input 
            type="text"
            placeholder="Nombre del nuevo perfil..."
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            className={`${styles.inputField} ${styles.profilesSection__input}`}
          />
          <button className={styles.profilesSection__btn} onClick={handleCreateProfile}>
            RESPALDAR ESTUDIO
          </button>
        </div>

        <div className={styles.profilesList}>
          {profiles.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#666', textAlign: 'center', padding: '15px' }}>
              No hay perfiles de respaldo guardados aún.
            </div>
          ) : (
            profiles.map(pName => (
              <div key={pName} className={styles.profileCard}>
                <span className={styles.profileCard__name}>{pName}</span>
                <div className={styles.profileCard__actions}>
                  <button 
                    className={`${styles.profileCard__btn} ${styles['profileCard__btn--load']}`}
                    onClick={() => handleLoadProfile(pName)}
                  >
                    📂 CARGAR
                  </button>
                  <button 
                    className={`${styles.profileCard__btn} ${styles['profileCard__btn--delete']}`}
                    onClick={() => handleDeleteProfile(pName)}
                  >
                    ❌ ELIMINAR
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.versionInfo}>
        KSM AirControl Studio — Versión {packageJson.version}
      </div>
    </div>
  );
}
