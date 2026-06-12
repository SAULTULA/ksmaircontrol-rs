import React from 'react';
import styles from './LicenseScreen.module.css';

const electron = window.electron || (window.require ? window.require('electron') : null);

export default function LicenseScreen({ licenseData }) {
  const handleRevalidate = () => {
    if (electron) electron.ipcRenderer.invoke('license:revalidate');
  };

  return (
    <div className={styles.licenseContainer}>
      <div className={styles.licenseBox}>
        <h1 className={styles.title}>KSM AirControl</h1>
        <h2 className={styles.subtitle}>SISTEMA BLOQUEADO</h2>
        
        <p className={styles.description}>
          Esta copia de KSM AirControl requiere activación comercial.
          Por favor, envíe su ID de Hardware (HWID) al soporte de KSM para activar su licencia.
        </p>

        <div className={styles.hwidBox}>
          <span className={styles.hwidLabel}>SU HWID:</span>
          <code className={styles.hwidValue}>{licenseData?.hwid || 'CARGANDO...'}</code>
        </div>

        {licenseData?.error && (
           <p className={styles.errorMsg}>Error: {licenseData.error === 'sin_conexion' ? 'No se pudo conectar al servidor de licencias. Revise su internet.' : 'Licencia revocada o inexistente.'}</p>
        )}

        <button className={styles.btnRevalidate} onClick={handleRevalidate}>
          REINTENTAR ACTIVACIÓN
        </button>
      </div>
    </div>
  );
}
