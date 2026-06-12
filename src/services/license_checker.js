/**
 * KSM License Checker Module (Adaptado para Electron KSM AirControl)
 */

async function getDeviceHWID() {
  // En Electron, obtenemos el HWID real seguro mediante IPC
  if (window.electron) {
    try {
      const hwid = await window.electron.ipcRenderer.invoke('license:getHWID');
      if (hwid) return hwid;
    } catch (e) {
      console.warn("No se pudo obtener HWID por IPC, cayendo a localStorage", e);
    }
  }

  // Fallback si corre en navegador (Modo DEV sin Electron)
  let hwid = localStorage.getItem('ksm_device_hwid');
  if (!hwid) {
    hwid = 'KSM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem('ksm_device_hwid', hwid);
  }
  return hwid;
}

const SUPABASE_PROJECT_REF = 'jnscgzsmyfaqnlovxhdh';
const SUPABASE_ANON_KEY = 'sb_publishable_' + 'U6mWpXwGDIwGGGDvO7DoXA_aO1UiSKr';
const SUPABASE_EDGE_FUNCTION_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/verify-license`;

let currentAppName = '';
let initialOverlay = null;

function createOverlay() {
  if (document.getElementById('ksm-license-overlay')) return;
  
  initialOverlay = document.createElement('div');
  initialOverlay.id = 'ksm-license-overlay';
  Object.assign(initialOverlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: '#0f1115', color: '#f8f9fa', display: 'flex',
    flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    zIndex: '999999', fontFamily: 'system-ui, sans-serif', padding: '20px'
  });
  initialOverlay.innerHTML = '<div style="text-align:center"><h2>Verificando Licencia...</h2><p style="color:#a1a5b0">Iniciando conexión segura con KSM...</p></div>';
  document.documentElement.appendChild(initialOverlay);
}

export async function verifyLicense(appName) {
  currentAppName = appName;
  const hwid = await getDeviceHWID();
  
  // Esperar 300ms antes de mostrar el cartel de carga.
  // Si el servidor responde antes (lo cual es normal para clientes activos),
  // la app se abrirá instantáneamente de forma fluida.
  const overlayTimer = setTimeout(() => {
    createOverlay();
  }, 300);

  return new Promise((resolve) => {
    checkWithServer(hwid, appName, null, (authorized) => {
      clearTimeout(overlayTimer);
      resolve(authorized);
    });
  });
}

async function checkWithServer(hwid, appName, clientName = null, resolveObj = null) {
  try {
    const payload = { hwid, app_name: appName };
    if (clientName) payload.client_name = clientName;

    const response = await fetch(SUPABASE_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.authorized) {
      console.log("[KSM License] Acceso Permitido.");
      if (initialOverlay) {
        initialOverlay.remove();
        initialOverlay = null; // Resetear referencia
      }
      if (resolveObj) resolveObj(true); // Desbloquea la app
    } else {
      renderBlockScreen(data.status, data.message, hwid, resolveObj);
    }
  } catch (error) {
    console.error("[KSM License] Error crítico:", error);
    renderBlockScreen('error', `No se pudo conectar con el servidor de licencias.`, hwid, resolveObj);
  }
}

function renderBlockScreen(status, message, hwid, resolveObj) {
  if (!initialOverlay) createOverlay();
  initialOverlay.innerHTML = ''; 

  const container = document.createElement('div');
  Object.assign(container.style, {
    backgroundColor: '#1a1d24', padding: '40px', borderRadius: '16px',
    maxWidth: '500px', width: '100%', textAlign: 'center',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)'
  });

  let titleHtml = '';
  let bodyHtml = '';

  if (status === 'not_registered') {
    titleHtml = `<h1 style="color: #6366f1; margin: 0 0 10px 0;">Registro Requerido</h1>`;
    bodyHtml = `
      <p style="color: #a1a5b0; margin-bottom: 25px;">Ingresa tu nombre para solicitar acceso a ${currentAppName}.</p>
      <input type="text" id="ksm-client-name" placeholder="Tu Nombre o Empresa" style="width: 100%; padding: 12px; margin-bottom: 15px; background: #0f1115; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; font-size: 16px; outline: none;" />
      <button id="ksm-submit-btn" style="width: 100%; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">Enviar Solicitud</button>
    `;
  } else if (status === 'pending' || status === 'blocked') {
    titleHtml = `<h1 style="color: #f59e0b; margin: 0 0 10px 0;">Acceso Restringido</h1>`;
    bodyHtml = `
      <p style="color: #a1a5b0; margin-bottom: 25px;">${message}</p>
      <div style="padding: 15px; background: #0f1115; border-radius: 8px; margin-bottom: 20px; font-family: monospace;">ID: ${hwid}</div>
      <button id="ksm-refresh-btn" style="width: 100%; padding: 12px; background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-size: 16px; cursor: pointer;">Refrescar Estado</button>
    `;
  } else if (status === 'expired') {
    titleHtml = `<h1 style="color: #ef4444; margin: 0 0 10px 0;">Licencia Expirada</h1>`;
    bodyHtml = `
      <p style="color: #a1a5b0; margin-bottom: 25px;">${message}</p>
      <button id="ksm-refresh-btn" style="width: 100%; padding: 12px; background: #ef4444; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer;">Renovar Suscripción</button>
    `;
  } else {
    titleHtml = `<h1 style="color: #ef4444; margin: 0 0 10px 0;">Error de Conexión</h1>`;
    bodyHtml = `
      <p style="color: #a1a5b0; margin-bottom: 25px;">${message}</p>
      <div style="padding: 15px; background: #0f1115; border-radius: 8px; font-family: monospace; font-size:12px; color:#ef4444">${hwid}</div>
      <button onclick="window.location.reload()" style="margin-top:20px; color:#6366f1; background:none; border:none; cursor:pointer; text-decoration:underline">Reintentar</button>
    `;
  }

  container.innerHTML = titleHtml + bodyHtml;
  initialOverlay.appendChild(container);

  // Bind Events
  if (status === 'not_registered') {
    document.getElementById('ksm-submit-btn').addEventListener('click', () => {
      const name = document.getElementById('ksm-client-name').value;
      if (name.trim().length > 0) {
        document.getElementById('ksm-submit-btn').innerText = 'Enviando...';
        checkWithServer(hwid, currentAppName, name, resolveObj);
      }
    });
  }

  if (status === 'pending' || status === 'expired' || status === 'blocked') {
    document.getElementById('ksm-refresh-btn').addEventListener('click', () => {
      document.getElementById('ksm-refresh-btn').innerText = 'Verificando...';
      checkWithServer(hwid, currentAppName, null, resolveObj);
    });
  }
}
