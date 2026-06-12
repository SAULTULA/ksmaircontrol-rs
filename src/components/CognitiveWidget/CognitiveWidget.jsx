import React, { useState, useEffect, useRef } from 'react';
import styles from './CognitiveWidget.module.css';

const electron = window.electron || (window.require ? window.require('electron') : null);

export default function CognitiveWidget({ currentTrack, tracksCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { text: "¡Hola! Soy tu asistente de Inteligencia Artificial. He analizado el código fuente de esta aplicación y conozco su arquitectura. Configura tu API Key de Gemini en los ajustes para conectarme a internet, de lo contrario operaré en modo offline local. ¿En qué puedo ayudarte hoy?", isUser: false }
  ]);
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Cargar configuración de API al montar y al abrir
  const loadConfig = () => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-config').then(config => {
        if (config && config.geminiApiKey) {
          setApiKey(config.geminiApiKey);
        } else {
          setApiKey('');
        }
      });
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  // Escuchar el evento global de guardado de config para actualizar el estado inmediatamente
  useEffect(() => {
    const handleConfigSaved = (e) => {
      const newKey = e.detail?.geminiApiKey || '';
      setApiKey(newKey);
    };
    window.addEventListener('ksm-config-saved', handleConfigSaved);
    return () => window.removeEventListener('ksm-config-saved', handleConfigSaved);
  }, []);

  const handleResponseCommands = (text) => {
    // 1. Play
    if (text.includes('[CMD:PLAY]')) {
      console.log('[AI Cerebro] Ejecutando comando: PLAY');
      window.dispatchEvent(new CustomEvent('ksm-brain-play'));
    }
    // 2. Stop
    if (text.includes('[CMD:STOP]')) {
      console.log('[AI Cerebro] Ejecutando comando: STOP');
      window.dispatchEvent(new CustomEvent('ksm-brain-stop'));
    }
    // 3. Locución Horaria
    if (text.includes('[CMD:ANNOUNCE_TIME]')) {
      console.log('[AI Cerebro] Ejecutando comando: ANNOUNCE_TIME');
      window.dispatchEvent(new CustomEvent('ksm-brain-announce-time'));
    }
    // 4. Cambiar Skin
    const skinMatch = text.match(/\[CMD:CHANGE_SKIN:\s*([^\]\s]+)\]/);
    if (skinMatch) {
      const newSkin = skinMatch[1].trim();
      if (['studio-dark', 'radioboss-silver', 'salamandra-blue', 'cyber-neon'].includes(newSkin)) {
        console.log(`[AI Cerebro] Ejecutando comando: CHANGE_SKIN a ${newSkin}`);
        localStorage.setItem('ksm_skin', newSkin);
        document.documentElement.setAttribute('data-skin', newSkin);
        window.dispatchEvent(new CustomEvent('ksm-skin-changed', { detail: newSkin }));
      }
    }
  };

  const triggerSend = async (text) => {
    if (!text.trim()) return;

    setMessages(prev => [...prev, { text: text, isUser: true }]);
    setInput('');

    // Respuesta temporal de carga
    setMessages(prev => [...prev, { text: "Procesando consulta cognitiva...", isUser: false, isLoading: true }]);

    // Obtener la API Key más actualizada de la base de datos justo antes de enviar
    let currentApiKey = '';
    if (electron) {
      try {
        const config = await electron.ipcRenderer.invoke('db-get-config');
        if (config && config.geminiApiKey) {
          currentApiKey = config.geminiApiKey;
          setApiKey(currentApiKey);
        } else {
          setApiKey('');
        }
      } catch (err) {
        console.error("Error al cargar la API Key antes de enviar:", err);
      }
    }

    try {
      let replyText = "No recibí respuesta de mi cerebro cognitivo.";
      if (electron) {
        const data = await electron.ipcRenderer.invoke('cognitive-agent-query', { 
          query: text,
          geminiApiKey: currentApiKey,
          currentTrack: currentTrack ? { title: currentTrack.title, artist: currentTrack.artist || 'Desconocido' } : null,
          tracksCount: tracksCount
        });
        replyText = data.response || replyText;
      } else {
        replyText = "El entorno nativo de Electron no está disponible.";
      }
      
      // Procesar comandos ocultos
      handleResponseCommands(replyText);
      
      // Limpiar del texto visible
      const cleanText = replyText.replace(/\[CMD:[^\]\n]+\]/g, '').trim();

      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        text: cleanText || "Comando procesado correctamente.",
        isUser: false
      }));
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        text: `⚠️ Error de comunicación cognitiva: ${err.message}`,
        isUser: false
      }));
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    triggerSend(input);
  };

  return (
    <div className={styles.cognitivewidget}>
      <button 
        className={styles.cognitivewidget__trigger} 
        onClick={() => setIsOpen(!isOpen)}
        title="Asistente de IA Cognitivo"
      >
        🧠
      </button>

      {isOpen && (
        <div className={styles.cognitivewidget__panel}>
          <header className={styles.cognitivewidget__header}>
            <span className={styles.cognitivewidget__icon}>🧠</span>
            <div className={styles.cognitivewidget__titleinfo}>
              <h4 className={styles.cognitivewidget__title}>Copiloto Autoadaptativo</h4>
              <span className={`${styles.cognitivewidget__status} ${apiKey ? styles['cognitivewidget__status--online'] : styles['cognitivewidget__status--offline']}`}>
                {apiKey ? '🟢 Cerebro Online (Gemini)' : '🔌 Cerebro Local (Offline)'}
              </span>
            </div>
          </header>

          <div className={styles.cognitivewidget__chat} ref={chatRef}>
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`${styles.cognitivewidget__msg} ${msg.isUser ? styles['cognitivewidget__msg--user'] : styles['cognitivewidget__msg--agent']}`}
                style={msg.isLoading ? { opacity: 0.6, fontStyle: 'italic' } : {}}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className={styles.cognitivewidget__chips}>
            <button className={styles.cognitivewidget__chip} onClick={() => triggerSend("🎵 Iniciar música")}>🎵 Play</button>
            <button className={styles.cognitivewidget__chip} onClick={() => triggerSend("⏱️ Locución de hora")}>⏱️ Dar hora</button>
            <button className={styles.cognitivewidget__chip} onClick={() => triggerSend("🎨 Activar tema Cyber Neon")}>🎨 Neón</button>
            <button className={styles.cognitivewidget__chip} onClick={() => triggerSend("¿Qué canción está sonando?")}>¿Qué suena?</button>
          </div>

          <form className={styles.cognitivewidget__form} onSubmit={handleSend}>
            <input 
              type="text" 
              className={styles.cognitivewidget__input} 
              placeholder="Pregúntame o controla la app..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className={styles.cognitivewidget__send}>Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
}
