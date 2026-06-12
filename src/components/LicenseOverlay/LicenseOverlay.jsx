import React, { useState, useEffect } from 'react';
import styles from './LicenseOverlay.module.css';

export default function LicenseOverlay() {
  const [licensed, setLicensed] = useState(true);
  const [hwid, setHwid] = useState('');
  const [status, setStatus] = useState('loading'); // 'loading', 'unlicensed', 'connection_error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!window.electronAPI) return;

    if (typeof window.electronAPI.onLicenseOk === 'function') {
      window.electronAPI.onLicenseOk(() => {
        setLicensed(true);
        setStatus('ok');
      });
    }

    if (typeof window.electronAPI.onLicenseReq === 'function') {
      window.electronAPI.onLicenseReq((data) => {
        setLicensed(false);
        setHwid(data.hwid);
        if (data.error === 'sin_conexion') {
          setStatus('connection_error');
          setErrorMsg('No se pudo verificar la licencia. Comprueba tu conexión a internet.');
        } else {
          setStatus('unlicensed');
        }
      });
    }

    const initCheck = async () => {
      try {
        if (window.electronAPI.getHWID) {
          const rawHwid = await window.electronAPI.getHWID();
          setHwid(rawHwid);
        }
      } catch (err) {
        console.error(err);
      }
    };
    initCheck();
  }, []);

  const handleVerify = async () => {
    if (!window.electronAPI || !window.electronAPI.revalidate) return;
    setStatus('loading');
    try {
      const res = await window.electronAPI.revalidate();
      if (res.licensed) {
        setLicensed(true);
        setStatus('ok');
      } else {
        setLicensed(false);
        if (res.error === 'sin_conexion') {
          setStatus('connection_error');
          setErrorMsg('Reintento fallido: Verifica tu conexión a internet.');
        } else {
          setStatus('unlicensed');
        }
      }
    } catch (err) {
      setStatus('connection_error');
      setErrorMsg('Error al conectar con el servidor.');
    }
  };

  const handleCopyHWID = () => {
    if (hwid) {
      navigator.clipboard.writeText(hwid);
      alert('¡Código HWID copiado al portapapeles!');
    }
  };

  if (licensed) return null;

  return (
    <div className={styles.licenseoverlay}>
      <div className={styles.licenseoverlay__card}>
        <div className={styles.licenseoverlay__header}>
          <span className={styles.licenseoverlay__icon}>🔐</span>
          <h2 className={styles.licenseoverlay__title}>Activación de Licencia KSM</h2>
          <span className={styles.licenseoverlay__subtitle}>Este software está protegido con licencia por HWID</span>
        </div>

        <div className={styles.licenseoverlay__body}>
          {status === 'loading' ? (
            <div className={styles.licenseoverlay__state}>
              <div className={styles.licenseoverlay__spinner} />
              <p>Verificando credenciales de hardware en el Hub Supabase...</p>
            </div>
          ) : (
            <>
              <p className={styles.licenseoverlay__text}>
                Tu Identificador Único de Hardware (HWID) no está activado para este software. Envía este código a KSM para habilitar tu acceso:
              </p>
              
              <div className={styles.licenseoverlay__hwidbox}>
                <code className={styles.licenseoverlay__hwid}>{hwid || 'CARGANDO...'}</code>
                <button className={styles.licenseoverlay__copybtn} onClick={handleCopyHWID}>Copiar</button>
              </div>

              {status === 'connection_error' && (
                <div className={styles.licenseoverlay__errorbox}>
                  ⚠️ <strong>Error de Conexión:</strong> {errorMsg}
                </div>
              )}

              <button className={styles.licenseoverlay__verifybtn} onClick={handleVerify}>
                🔄 Verificar Activación
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
