import LicenseOverlay from './components/LicenseOverlay/LicenseOverlay';
import CognitiveWidget from './components/CognitiveWidget/CognitiveWidget';
import React, { useState, useEffect, useRef } from 'react';
import styles from './App.module.css';
import { resolveAudioUrl } from './utils/audioUrl';
import packageJson from '../package.json';
import Header from './components/Header/Header.jsx';
import MainPlayer from './components/MainPlayer/MainPlayer.jsx';
import Playlist from './components/Playlist/Playlist.jsx';
import Cartwall from './components/Cartwall/Cartwall.jsx';
import CrossfadeConfig from './components/CrossfadeConfig/CrossfadeConfig.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import TrackTool from './components/TrackTool/TrackTool.jsx';
import CommandCenter from './components/CommandCenter/CommandCenter.jsx';
import CircularVumeter from './components/CircularVumeter/CircularVumeter.jsx';
import SilenceDetector from './components/SilenceDetector/SilenceDetector.jsx';
import ConfigPanel from './components/ConfigPanel/ConfigPanel.jsx';
import AdScheduler from './components/AdScheduler/AdScheduler.jsx';
import WindowPortal from './components/WindowPortal/WindowPortal.jsx';
import { createClient } from '@supabase/supabase-js';
import { webRTCReceiver } from './services/WebRTCReceiver.js';
import { verifyLicense } from './services/license_checker.js';
import { telemetryService } from './services/TelemetryService.js';

const electron = window.electron || (window.require ? window.require('electron') : null);
const fs = window.require ? window.require('fs') : null;

let globalSupabaseClient = null;

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingTrack, setEditingTrack] = useState(null);
  const [announcementMsg, setAnnouncementMsg] = useState(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCartActive, setIsCartActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showDSP, setShowDSP] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState('mixer');
  const [showConfig, setShowConfig] = useState(false);

  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [customBg, setCustomBg] = useState(localStorage.getItem('ksm_custom_bg') || null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [isAdsOpen, setIsAdsOpen] = useState(false);
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const [stationName, setStationName] = useState('');
  const [stationLogo, setStationLogo] = useState('');
  const [enableLogoAnimation, setEnableLogoAnimation] = useState(false);

  const [outputSettings, setOutputSettings] = useState({
    localVolume: 0.8,
    emissionVolume: 1.0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    compression: true
  });

  const [isVuDocked, setIsVuDocked] = useState(localStorage.getItem('ksm_vu_docked') === 'true');

  const [autoTimeAnnounce, setAutoTimeAnnounce] = useState(localStorage.getItem('ksm_auto_time') === 'true');
  const [isTimeAnnouncing, setIsTimeAnnouncing] = useState(false);

  const [isCrossfadeOpen, setIsCrossfadeOpen] = useState(false);
  const [crossfadeSettings, setCrossfadeSettings] = useState(() => {
    const saved = localStorage.getItem('ksm_crossfade_settings');
    return saved ? JSON.parse(saved) : { mode: 'smart', duration: 5 };
  });

  const [silenceSettings, setSilenceSettings] = useState({ enabled: false, timeout: 15 });

  const [audioSystem, setAudioSystem] = useState({ audioContext: null, mixerDestination: null });

  const audioContextRef = useRef(null);
  const mixerDestinationRef = useRef(null);
  const masterBusRef = useRef(null); // Bus donde se mezcla TODO
  const eqLowRef = useRef(null);
  const eqMidRef = useRef(null);
  const eqHighRef = useRef(null);
  const limiterRef = useRef(null);
  const localGainRef = useRef(null);
  const emissionGainRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const encoderRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const voiceAudioRef = useRef(new Audio());
  const voiceSourceRef = useRef(null);
  const streamingStateRef = useRef({ isStreaming: false, encoderConfig: null });
  const isStreamingActiveRef = useRef(false);
  const tracksRef = useRef(tracks);
  const currentIndexRef = useRef(currentIndex);
  const supabaseClientRef = useRef(null);


  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const loadBrandConfig = async () => {
      if (electron) {
        try {
          const config = await electron.ipcRenderer.invoke('db-get-config');
          if (config) {
            setStationName(config.stationName || '');
            setStationLogo(config.stationLogo || '');
            setEnableLogoAnimation(config.enableLogoAnimation || false);
          }
        } catch (e) {}
      }
    };
    loadBrandConfig();

    const handleConfigSaved = (e) => {
      const config = e.detail || {};
      setStationName(config.stationName || '');
      setStationLogo(config.stationLogo || '');
      setEnableLogoAnimation(config.enableLogoAnimation || false);
    };
    window.addEventListener('ksm-config-saved', handleConfigSaved);
    return () => window.removeEventListener('ksm-config-saved', handleConfigSaved);
  }, []);

  // INIT AUDIO CONTEXT
  useEffect(() => {
    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      
      // 1. Creación de Nodos de Procesamiento
      const masterBus = ctx.createGain();
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 3000;
      const limiter = ctx.createDynamicsCompressor();
      const localGain = ctx.createGain();
      const emissionGain = ctx.createGain();

      // 2. Conexión de la Cadena
      masterBus.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(limiter);
      
      limiter.connect(localGain);
      localGain.connect(ctx.destination); // SALIDA LOCAL (PARLANTES)
      
      limiter.connect(emissionGain);
      emissionGain.connect(dest); // SALIDA EMISIÓN (ENCODER)

      audioContextRef.current = ctx;
      mixerDestinationRef.current = dest;
      masterBusRef.current = masterBus;
      eqLowRef.current = low;
      eqMidRef.current = mid;
      eqHighRef.current = high;
      limiterRef.current = limiter;
      localGainRef.current = localGain;
      emissionGainRef.current = emissionGain;

      setAudioSystem({ audioContext: ctx, mixerDestination: masterBus });

      voiceSourceRef.current = ctx.createMediaElementSource(voiceAudioRef.current);
      voiceSourceRef.current.connect(masterBus);

      // WebRTC es manejado por el componente Mixer directamente

    }
    const savedSkin = localStorage.getItem('ksm_skin') || 'studio-dark';
    document.documentElement.setAttribute('data-skin', savedSkin);
    
    // Verificación de Licencia KSM Supabase
    verifyLicense('KSM AirControl').then(() => {
      console.log("[KSM] Licencia validada. Iniciando App...");
    });

    if (electron) {
      electron.ipcRenderer.on('set-skin', (e, skin) => {
        document.documentElement.setAttribute('data-skin', skin);
        localStorage.setItem('ksm_skin', skin);
      });
      electron.ipcRenderer.on('open-config', () => setShowConfig(true));

      // ── RECEPTORES DE COMANDOS RADIOBOSS API ──
      electron.ipcRenderer.on('radioboss-api:inserttrack', (e, filename) => {
        console.log('[RadioBOSS API] Insertando track:', filename);
        // Creamos un track básico
        const newTrack = {
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          title: filename.split(/[/\\]/).pop().replace(/\.[^/.]+$/, ""), // quitar extensión
          artist: "🎙️ Pedido Musical",
          duration: 0,
          filePath: filename,
          nativeFile: null,
          tabCategory: 'main',
          type: 'music'
        };
        // Insertamos usando callback del estado para evitar closures obsoletos, justo después de la actual
        setTracks(prev => {
          const updated = [...prev];
          const insertIndex = prev.length > 0 ? currentIndexRef.current + 1 : 0;
          updated.splice(insertIndex, 0, newTrack);
          return updated;
        });
      });

      electron.ipcRenderer.on('radioboss-api:play', () => {
        window.dispatchEvent(new CustomEvent('ksm-brain-play'));
      });

      electron.ipcRenderer.on('radioboss-api:stop', () => {
        window.dispatchEvent(new CustomEvent('ksm-brain-stop'));
      });

      electron.ipcRenderer.on('radioboss-api:mic', (e, state) => {
        window.dispatchEvent(new CustomEvent('ksm-mic-ducking', { detail: state }));
      });

      electron.ipcRenderer.on('radioboss-api:webrtc-state', (e, state) => {
        window.dispatchEvent(new CustomEvent('ksm-webrtc-state', { detail: state }));
      });

      electron.ipcRenderer.on('ksm-api:set-station-id', (e, payload) => {
        const { id, url, key } = typeof payload === 'string' ? { id: payload } : payload;
        console.log('[KSM API] Station ID sincronizado remotamente:', id);
        // Actualizar en memoria
        webRTCReceiver._stationId = id;
        if (url && key) {
           import('@supabase/supabase-js').then(({ createClient }) => {
             webRTCReceiver._supabaseClient = createClient(url, key);
             window.dispatchEvent(new CustomEvent('ksm-station-id-updated', { detail: { stationId: id } }));
           });
        } else {
           window.dispatchEvent(new CustomEvent('ksm-station-id-updated', { detail: { stationId: id } }));
        }

        // Guardar en disco para que persista entre reinicios
        electron.ipcRenderer.invoke('db-get-config').then(cfg => {
          if (cfg) {
            cfg.stationId = id;
            if (url) cfg.webSupabaseUrl = url;
            if (key) cfg.webSupabaseKey = key;
            electron.ipcRenderer.invoke('db-save-config', cfg);
          }
        });
      });

      electron.ipcRenderer.invoke('db-get-config').then(savedConfig => {
        if (savedConfig) {
          telemetryService.init(savedConfig.stationId, savedConfig.supabaseUrl, savedConfig.supabaseAnonKey);
          setSupabaseUrl(savedConfig.supabaseUrl);
          webRTCReceiver._stationId = savedConfig.stationId;
          webRTCReceiver._stationName = savedConfig.stationName;
          
          if (savedConfig.webSupabaseUrl && savedConfig.webSupabaseKey) {
            import('@supabase/supabase-js').then(({ createClient }) => {
              webRTCReceiver._supabaseClient = createClient(savedConfig.webSupabaseUrl, savedConfig.webSupabaseKey);
            });
          }
          
          setSilenceSettings({
            enabled: savedConfig.silenceDetectorEnabled || false,
            timeout: savedConfig.silenceDetectorTimeout || 15
          });
          
          // 3. CONEXIÓN AL CEREBRO CENTRAL (Supabase Realtime)
          const hasRealSupabase = savedConfig.supabaseUrl 
            && savedConfig.supabaseAnonKey 
            && savedConfig.supabaseUrl.startsWith('https://') 
            && savedConfig.supabaseAnonKey.length > 10;

          if (hasRealSupabase) {
            if (!globalSupabaseClient) {
              globalSupabaseClient = createClient(savedConfig.supabaseUrl, savedConfig.supabaseAnonKey);
            }
            const supabase = globalSupabaseClient;
            supabaseClientRef.current = supabase;

            // Canal Global de Avisos
            const globalChannel = supabase.channel('ksm-global');
            
            globalChannel.on('broadcast', { event: 'ksm-alert' }, (envelope) => {
              console.log("[Cerebro Central] Mensaje recibido:", envelope);
              // Intentamos obtener el mensaje de varias formas por compatibilidad
              const msg = envelope.payload?.message || envelope.message;
              if (msg) {
                setAnnouncementMsg(`📢 CENTRAL: ${msg}`);
                setTimeout(() => setAnnouncementMsg(null), 10000);
              }
            })
            .subscribe((status) => {
              console.log("[Cerebro Central] Estado suscripción global:", status);
            });

            // Canal Específico de la Estación (Comandos Remotos)
            const stationChannel = supabase.channel(`ksm-station-${savedConfig.stationId}`);
            stationChannel.on('broadcast', { event: 'ksm-command' }, (payload) => {
              console.log("[Cerebro Central] Comando recibido:", payload);
              if (payload.payload?.action === 'play') window.dispatchEvent(new CustomEvent('ksm-brain-play'));
              if (payload.payload?.action === 'stop') window.dispatchEvent(new CustomEvent('ksm-brain-stop'));
            })
            .subscribe((status) => {
              console.log(`[Cerebro Central] Estado suscripción estación (${savedConfig.stationId}):`, status);
            });

            // 4. WebRTC: guardamos el cliente Supabase en el receiver para que Mixer lo use
            if (webRTCReceiver) {
              webRTCReceiver._supabaseClient = supabase;
              webRTCReceiver._stationId = savedConfig.stationId;
            }
          } else {
            console.log("[App] Sin credenciales de Supabase configuradas. El móvil WebRTC no estará disponible hasta configurar Supabase en Ajustes.");
          }
        }
        // Se comenta la carga automática a petición del usuario para que la app inicie vacía
        /*
        electron.ipcRenderer.invoke('db-get-playlist').then(savedTracks => {
          if (savedTracks && savedTracks.length > 0) {
            setTracks(savedTracks);
          }
        });
        */
        telemetryService.start(() => ({
            currentTrack: tracksRef.current[currentIndexRef.current],
            tracksCount: tracksRef.current.length,
            isStreaming: streamingStateRef.current.isStreaming,
            encoderConfig: streamingStateRef.current.encoderConfig
          }));
      });
    }

    return () => {
      telemetryService.stop();
      if (electron) {
        electron.ipcRenderer.removeAllListeners('set-skin');
        electron.ipcRenderer.removeAllListeners('open-config');
        electron.ipcRenderer.removeAllListeners('radioboss-api:inserttrack');
        electron.ipcRenderer.removeAllListeners('radioboss-api:play');
        electron.ipcRenderer.removeAllListeners('radioboss-api:stop');
        electron.ipcRenderer.removeAllListeners('radioboss-api:mic');
        electron.ipcRenderer.removeAllListeners('radioboss-api:webrtc-state');
        electron.ipcRenderer.removeAllListeners('ksm-api:set-station-id');
      }
    };
  }, []);

  // ==========================================
  // ⏰ MONITOR DE PLAYLISTS PROGRAMADAS
  // ==========================================
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHour}:${currentMinute}`;

      // Buscar programaciones en localStorage
      const keys = Object.keys(localStorage).filter(k => k.startsWith('ksm_schedule_'));
      
      keys.forEach(key => {
        const schedDataStr = localStorage.getItem(key);
        const playlistName = key.replace('ksm_schedule_', '');
        
        let parsedSched = null;
        try {
          parsedSched = JSON.parse(schedDataStr);
        } catch(e) {
          // Legacy support
          parsedSched = { time1: schedDataStr, time2: '', days: { 0:true,1:true,2:true,3:true,4:true,5:true,6:true } };
        }

        // Chequear si el día de hoy está habilitado para esta playlist
        const currentDay = now.getDay();
        if (!parsedSched.days || !parsedSched.days[currentDay]) return;

        // Validar si la hora actual coincide con H1 o H2
        if (parsedSched.time1 === currentTimeStr || (parsedSched.time2 && parsedSched.time2 === currentTimeStr)) {
          const lastTriggered = localStorage.getItem(`ksm_last_trigger_${playlistName}`);
          
          // Evitar que se dispare múltiples veces en el mismo minuto
          if (lastTriggered !== currentTimeStr) {
            console.log(`[Programador] ¡HORA DE INICIO! Cargando playlist: ${playlistName}`);
            
            const savedData = localStorage.getItem(`ksm_playlist_${playlistName}`);
            if (savedData) {
              const { tracks: savedTracks } = JSON.parse(savedData);
              
              // Cargar los tracks en la pauta principal
              const newTracks = savedTracks.map(t => ({ ...t, tabCategory: 'main' }));
              
              setTracks(prevTracks => {
                const updated = [...prevTracks];
                // Inyectar los temas de la playlist programada inmediatamente después del tema actual
                const insertIndex = currentIndexRef.current + 1;
                updated.splice(insertIndex, 0, ...newTracks);
                console.log(`[Programador] Inyectadas ${newTracks.length} pistas en posición ${insertIndex}`);
                return updated;
              });
              
              localStorage.setItem(`ksm_last_trigger_${playlistName}`, currentTimeStr);
              
              // Aviso suave en pantalla en lugar de alert()
              setAnnouncementMsg(`📢 PROGRAMADOR: Iniciando playlist "${playlistName}"`);
              setTimeout(() => setAnnouncementMsg(null), 5000);

              // Forzamos el play de la playlist programada inyectada
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ksm-brain-play'));
              }, 150);
            }
          }
        }
      });
    };

    const scheduleInterval = setInterval(checkSchedule, 10000); // Revisar cada 10 seg
    return () => clearInterval(scheduleInterval);
  }, []);

  useEffect(() => {
    tracksRef.current = tracks;
    // Se comenta el guardado automático para evitar que se restaure al hacer Ctrl+R
    /*
    if (electron && tracks.length > 0) {
      electron.ipcRenderer.invoke('db-save-playlist', tracks.map(t => ({...t, nativeFile: null})));
    }
    */
  }, [tracks, electron]);

  // Emitir PlaybackInfo hacia el proceso Main (para la API de RadioBOSS)
  useEffect(() => {
    if (!electron) return;
    const isPlayingStr = tracks.length > 0 ? "1" : "0";
    let trackArtist = '';
    let trackTitle = '';
    if (tracks.length > 0 && currentIndex >= 0 && currentIndex < tracks.length) {
      const t = tracks[currentIndex];
      trackArtist = t.artist || '';
      trackTitle = t.title || t.name || '';
    }
    
    // Formato clásico RadioBOSS XML
    const xmlData = `<?xml version="1.0" encoding="utf-8"?>
<PlaybackInfo>
  <Playing>${isPlayingStr}</Playing>
  <CurrentTrack>
    <TRACK ARTIST="${trackArtist.replace(/"/g, '&quot;')}" TITLE="${trackTitle.replace(/"/g, '&quot;')}" />
  </CurrentTrack>
</PlaybackInfo>`;

    electron.ipcRenderer.send('radioboss-api:update-playbackinfo', xmlData);
    
    // Enviar también actualización para el NowPlaying.txt local
    if (tracks.length > 0 && currentIndex >= 0 && currentIndex < tracks.length) {
      electron.ipcRenderer.send('update-now-playing', tracks[currentIndex]);
    } else {
      electron.ipcRenderer.send('update-now-playing', null);
    }
  }, [currentIndex, tracks]);

  // Manejo de hotkeys nativas
  useEffect(() => {
    const handleMicDucking = (e) => setIsMicActive(e.detail);
    const handleCartDucking = (e) => setIsCartActive(e.detail);
    const handleBgChange = (e) => setCustomBg(e.detail);
    const handleAnnounceTime = () => {
      const city = localStorage.getItem('ksm_city') || 'BUENOS AIRES';
      const temp = localStorage.getItem('ksm_temp') || '22';
      const hum = localStorage.getItem('ksm_hum') || '60';
      triggerTimeAnnouncement(city, temp, hum);
    };
    // Al guardar configuración, cerrar el modal y aplicar settings
    const handleConfigSaved = (e) => {
      setShowConfig(false);
      if (e.detail) {
        setSilenceSettings({
          enabled: e.detail.silenceDetectorEnabled || false,
          timeout: e.detail.silenceDetectorTimeout || 15
        });
      }
    };
    window.addEventListener('ksm-mic-ducking', handleMicDucking);
    window.addEventListener('ksm-cart-ducking', handleCartDucking);
    window.addEventListener('ksm-bg-change', handleBgChange);
    window.addEventListener('ksm-brain-announce-time', handleAnnounceTime);
    window.addEventListener('ksm-config-saved', handleConfigSaved);
    return () => {
      window.removeEventListener('ksm-mic-ducking', handleMicDucking);
      window.removeEventListener('ksm-cart-ducking', handleCartDucking);
      window.removeEventListener('ksm-bg-change', handleBgChange);
      window.removeEventListener('ksm-brain-announce-time', handleAnnounceTime);
      window.removeEventListener('ksm-config-saved', handleConfigSaved);
    };
  }, []);

  // 4. ACTUALIZACIÓN DINÁMICA DEL DSP
  useEffect(() => {
    if (!audioContextRef.current || !eqLowRef.current) return;
    const time = audioContextRef.current.currentTime;
    
    // Volúmenes
    localGainRef.current.gain.setTargetAtTime(outputSettings.localVolume, time, 0.1);
    emissionGainRef.current.gain.setTargetAtTime(outputSettings.emissionVolume, time, 0.1);
    
    // Ecualizador
    eqLowRef.current.gain.setTargetAtTime(outputSettings.eqLow, time, 0.1);
    eqMidRef.current.gain.setTargetAtTime(outputSettings.eqMid, time, 0.1);
    eqHighRef.current.gain.setTargetAtTime(outputSettings.eqHigh, time, 0.1);
    
    // Compresión
    if (outputSettings.compression) {
      limiterRef.current.threshold.setTargetAtTime(-24, time, 0.1);
      limiterRef.current.knee.setTargetAtTime(30, time, 0.1);
      limiterRef.current.ratio.setTargetAtTime(12, time, 0.1);
      limiterRef.current.attack.setTargetAtTime(0.003, time, 0.1);
      limiterRef.current.release.setTargetAtTime(0.25, time, 0.1);
    } else {
      limiterRef.current.threshold.setTargetAtTime(0, time, 0.1);
    }
  }, [outputSettings]);

  const handleToggleRecording = async () => {
    if (!isRecording) {
      if (!electron) return alert("Ejecute en Electron.");
      const result = await electron.ipcRenderer.invoke('save-file-dialog', {
        title: 'Guardar Master de Emisión',
        defaultPath: `KSM_AirControl_Rec_${Date.now()}.webm`,
        filters: [{ name: 'Audio WebM', extensions: ['webm'] }]
      });
      if (result.canceled || !result.filePath) return;
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(mixerDestinationRef.current.stream);
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.onstop = async () => {
        const arrayBuffer = await new Blob(audioChunksRef.current, { type: 'audio/webm' }).arrayBuffer();
        const success = await electron.ipcRenderer.invoke('save-file-data', { filePath: result.filePath, buffer: Array.from(new Uint8Array(arrayBuffer)) });
        if (success) {
          if (confirm(`Grabación finalizada con éxito.\n¿Abrir ubicación del archivo?`)) {
            electron.ipcRenderer.send('show-item-in-folder', result.filePath);
          }
        } else {
          alert("Error al guardar la grabación en el disco.");
        }
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } else {
      if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); }
    }
  };

  const handleStreamingToggle = async (isStreaming, config) => {
    streamingStateRef.current = { isStreaming, encoderConfig: config };
    
    if (isStreaming) {
      if (isStreamingActiveRef.current) return;
      isStreamingActiveRef.current = true;

      const ctx = audioContextRef.current;
      if (!ctx) { isStreamingActiveRef.current = false; return; }

      if (ctx.state === 'suspended') await ctx.resume();

      try {
        if (!electron) {
          throw new Error("El entorno nativo de Electron no está disponible.");
        }

        // Validación preventiva de configuración
        if (!config.server || !config.port || !config.pass) {
          throw new Error("Configuración de encoder incompleta (Falta servidor, puerto o contraseña)");
        }

        // 1. Iniciar el motor de streaming nativo en Electron
        const startResult = await electron.ipcRenderer.invoke('start-streaming', config);
        if (!startResult.success) {
          throw new Error(startResult.error || "Fallo en la conexión del socket Icecast.");
        }

        // 2. Capturar audio directamente desde el masterBus (fuente real del audio mezclado)
        //    En lugar de createMediaStreamSource que puede tener referencias stale.
        const processor = ctx.createScriptProcessor(4096, 2, 2);
        // Nodo de silencio para que el processor tenga un destino válido sin duplicar audio local
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = (e) => {
          if (!isStreamingActiveRef.current) return;
          const leftFloat  = e.inputBuffer.getChannelData(0);
          const rightFloat = e.inputBuffer.getChannelData(1);
          
          const leftInt  = new Int16Array(leftFloat.length);
          const rightInt = new Int16Array(rightFloat.length);
          for (let i = 0; i < leftFloat.length; i++) {
            leftInt[i]  = Math.max(-32768, Math.min(32767, leftFloat[i]  * 32768));
            rightInt[i] = Math.max(-32768, Math.min(32767, rightFloat[i] * 32768));
          }

          electron.ipcRenderer.send('stream-pcm-chunk', { 
            left:  Array.from(leftInt), 
            right: Array.from(rightInt) 
          });
        };

        // Conectar: masterBus → processor → silentGain (mudo) → destination
        // El masterBus ya va al altavoz local por otra rama, así que no hay eco.
        masterBusRef.current.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(ctx.destination);

        encoderRecorderRef.current = {
          stop: async () => {
            try { 
              masterBusRef.current?.disconnect(processor);
              processor.disconnect();
              silentGain.disconnect();
              await electron.ipcRenderer.invoke('stop-streaming');
            } catch(e){}
          }
        };

        console.log('[Native Engine] Streaming nativo iniciado con éxito.');
      } catch (err) {
        console.error('[Native Engine] Error:', err);
        alert(`Error en el motor de transmisión: ${err.message}`);
        isStreamingActiveRef.current = false;
        window.dispatchEvent(new CustomEvent('ksm-streaming-error'));
      }
    } else {
      isStreamingActiveRef.current = false;
      if (encoderRecorderRef.current) {
        encoderRecorderRef.current.stop();
        encoderRecorderRef.current = null;
      }
    }
  };


  const triggerTimeAnnouncement = async (city, temp, humidity) => {
    // Si ya está anunciando, lo detenemos (Toggle)
    if (isTimeAnnouncing) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current.currentTime = 0;
      setIsTimeAnnouncing(false);
      setAnnouncementMsg(null);
      window.dispatchEvent(new CustomEvent('ksm-cart-ducking', { detail: false }));
      return;
    }

    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    
    setIsTimeAnnouncing(true);
    setAnnouncementMsg(`Locución en curso...`);
    window.dispatchEvent(new CustomEvent('ksm-cart-ducking', { detail: true }));

    try {
      if (!electron) {
        throw new Error("El entorno nativo de Electron no está disponible.");
      }

      const { sequence } = await electron.ipcRenderer.invoke('get-voice-announcement', { 
        temp: parseInt(temp), 
        hum: parseInt(humidity) 
      });

      let index = 0;
      
      const playNext = () => {
        if (index >= sequence.length) { 
          setIsTimeAnnouncing(false);
          setAnnouncementMsg(null); 
          window.dispatchEvent(new CustomEvent('ksm-cart-ducking', { detail: false }));
          return; 
        }
        // main.js ya devuelve ksm:// o https:// — usarlos directamente sin re-procesar
        const url = sequence[index];
        voiceAudioRef.current.src = url;
        voiceAudioRef.current.onended = () => { index++; playNext(); };
        voiceAudioRef.current.play().catch((err) => {
           console.error('[Locuciones] Error reproduciendo:', url, err);
           // Si un archivo falla, continuar con el siguiente de la secuencia en lugar de abortar
           index++;
           playNext();
        });
      };
      playNext();
    } catch (err) { 
      setIsTimeAnnouncing(false);
      setAnnouncementMsg(null); 
      window.dispatchEvent(new CustomEvent('ksm-cart-ducking', { detail: false }));
    }
  };

  // PROGRAMADOR DE HORA AUTOMÁTICO (TOP OF HOUR)
  useEffect(() => {
    const checkHour = setInterval(() => {
      if (!autoTimeAnnounce || isTimeAnnouncing) return;
      const now = new Date();
      // Disparar exactamente al minuto 00 y segundo 00
      if (now.getMinutes() === 0 && now.getSeconds() === 0) {
        console.log("[AutoTime] Disparando locución de hora automática...");
        const city = localStorage.getItem('ksm_city') || 'BUENOS AIRES';
        const temp = localStorage.getItem('ksm_temp') || '22';
        const hum = localStorage.getItem('ksm_hum') || '60';
        triggerTimeAnnouncement(city, temp, hum);
      }
    }, 1000);
    return () => clearInterval(checkHour);
  }, [autoTimeAnnounce, isTimeAnnouncing]);

  const appStyle = customBg ? {
    backgroundImage: `linear-gradient(rgba(11, 11, 18, 0.85), rgba(11, 11, 18, 0.85)), url(${customBg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed'
  } : {};

  const currentCat = tracks[currentIndex]?.tabCategory || 'main';
  const tabTracks = tracks.filter(t => (t.tabCategory || 'main') === currentCat);
  const idxInTab = tabTracks.findIndex(t => t.id === tracks[currentIndex]?.id);
  const calculatedNextTrack = idxInTab !== -1 && idxInTab < tabTracks.length - 1 ? tabTracks[idxInTab + 1] : null;

  return (
    <div className={styles.app} style={appStyle}>
      {editingTrack && (
        <TrackTool track={editingTrack} onClose={() => setEditingTrack(null)} onSave={(updated) => {
          setTracks(tracks.map(t => t.id === updated.id ? updated : t));
          setEditingTrack(null);
        }} />
      )}

      {/* CONTENEDOR FIJO */}
      {!isVuDocked && (
        <CircularVumeter 
          audioContext={audioSystem.audioContext} 
          emissionNode={emissionGainRef.current}
          localNode={localGainRef.current} 
          isDocked={false} 
          onToggleDock={() => {
            const newState = !isVuDocked;
            setIsVuDocked(newState);
            localStorage.setItem('ksm_vu_docked', newState);
          }}
        />
      )}

      <div className={styles.topBar}>
        <Header 
          onTriggerTimeAnnouncement={triggerTimeAnnouncement}
          isRecording={isRecording}
          onToggleRecording={handleToggleRecording}
          onOpenDSP={() => setShowDSP(!showDSP)}
          onOpenConfig={() => setShowConfig(true)}
          onStreamingStateChange={(isStreaming, config) => {
            handleStreamingToggle(isStreaming, config);
          }}
          autoTimeAnnounce={autoTimeAnnounce}
          onToggleAutoTime={() => {
            const next = !autoTimeAnnounce;
            setAutoTimeAnnounce(next);
            localStorage.setItem('ksm_auto_time', next);
          }}
          isFloatingOpen={isFloatingOpen}
          onToggleFloatingPanel={() => setIsFloatingOpen(!isFloatingOpen)}
        />
        <CommandCenter 
          onCommand={(cmd) => {
            if (cmd.action === 'play_main') {
              window.dispatchEvent(new CustomEvent('ksm-brain-play'));
            } else if (cmd.action === 'stop_main') {
              window.dispatchEvent(new CustomEvent('ksm-brain-stop'));
            } else if (cmd.action === 'inject_ad') {
              window.dispatchEvent(new CustomEvent('ksm-brain-inject-ad', { detail: cmd.block_name }));
            }
          }} 
          externalAnnouncement={announcementMsg} tracks={tracks} currentIndex={currentIndex}
          nextTrack={calculatedNextTrack}
          onOpenCrossfade={() => setIsCrossfadeOpen(true)}
          onOpenAds={() => setIsAdsOpen(true)}
          isVuDocked={isVuDocked} 
          onToggleVuDock={() => {
            const newState = !isVuDocked;
            setIsVuDocked(newState);
            localStorage.setItem('ksm_vu_docked', newState);
          }}
          audioContext={audioSystem.audioContext}
          emissionNode={emissionGainRef.current}
          localNode={localGainRef.current}
        />

        <SilenceDetector 
          audioContext={audioSystem.audioContext}
          emissionNode={emissionGainRef.current}
          enabled={silenceSettings.enabled}
          timeoutSeconds={silenceSettings.timeout}
          onSilenceDetected={() => {
            setAnnouncementMsg(`🚨 DETECTOR DE SILENCIO: Reiniciando Pauta Automáticamente.`);
            setTimeout(() => setAnnouncementMsg(null), 8000);
            
            if (tracksRef.current.length > 0) {
              // Si hay Shuffle, elige uno al azar, si no, vuelve a la pista 1 (índice 0)
              const nextIndex = isShuffle ? Math.floor(Math.random() * tracksRef.current.length) : 0;
              setCurrentIndex(nextIndex);
              window.dispatchEvent(new CustomEvent('ksm-brain-play'));
            }
          }}
        />
      </div>

      <div className={styles.studioLayout}>
        <div className={styles.sidebarSection}>
          <Sidebar 
            activeTab={activeSidebarTab} setActiveTab={setActiveSidebarTab}
            onAddTrack={(track) => setTracks(prev => [...prev, track])} 
            onBgChange={(path) => setCustomBg(path)}
            audioContext={audioSystem.audioContext}
            mixerDestination={audioSystem.mixerDestination}
            outputSettings={outputSettings}
            setOutputSettings={setOutputSettings}
          />
        </div>

        <main className={styles.mainSection}>
          <Playlist 
            tracks={tracks} setTracks={setTracks} currentTrackId={tracks[currentIndex]?.id} 
            onSelectTrack={(t) => setCurrentIndex(tracks.findIndex(x => x.id === t.id))}
            onOpenTrackTool={(t) => setEditingTrack(t)}
            isShuffle={isShuffle} setIsShuffle={setIsShuffle}
            isRepeat={isRepeat} setIsRepeat={setIsRepeat}
            hideAuxiliary={isFloatingOpen}
            mainPlayerComponent={
              <MainPlayer 
                currentTrack={tracks[currentIndex] || null} 
                nextTrack={calculatedNextTrack}
                onTrackComplete={() => {
                  const currentCat = tracks[currentIndex]?.tabCategory || 'main';
                  const tabTracks = tracks.filter(t => (t.tabCategory || 'main') === currentCat);
                  if (tabTracks.length === 0) return;

                  if (isShuffle) {
                    const rTrack = tabTracks[Math.floor(Math.random() * tabTracks.length)];
                    setCurrentIndex(tracks.findIndex(t => t.id === rTrack.id));
                  } else {
                    const idxInTab = tabTracks.findIndex(t => t.id === tracks[currentIndex].id);
                    if (idxInTab < tabTracks.length - 1) {
                      const nTrack = tabTracks[idxInTab + 1];
                      setCurrentIndex(tracks.findIndex(t => t.id === nTrack.id));
                    } else if (isRepeat) {
                      const fTrack = tabTracks[0];
                      if (tracks[currentIndex].id === fTrack.id) {
                        window.dispatchEvent(new CustomEvent('ksm-force-replay'));
                      } else {
                        setCurrentIndex(tracks.findIndex(t => t.id === fTrack.id));
                      }
                    }
                  }
                }}
                isMicDucking={isMicActive || isCartActive} showDSP={showDSP} onCloseDSP={() => setShowDSP(false)}
                audioContext={audioSystem.audioContext}
                mixerDestination={audioSystem.mixerDestination}
                crossfadeSettings={crossfadeSettings}
                supabaseUrl={supabaseUrl}
              />
            }
          />
        </main>

        {!isFloatingOpen && (
          <div className={styles.cartwallSection}>
            <Cartwall 
              onTriggerTrack={(track) => setTracks([track, ...tracks])} 
              audioContext={audioSystem.audioContext}
              mixerDestination={audioSystem.mixerDestination}
              supabaseUrl={supabaseUrl}
            />
          </div>
        )}

        {isFloatingOpen && (
          <WindowPortal onClose={() => setIsFloatingOpen(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px', padding: '10px' }}>
              <div style={{ flex: 1, minHeight: '300px' }}>
                <Playlist 
                  tracks={tracks} setTracks={setTracks} currentTrackId={tracks[currentIndex]?.id} 
                  onSelectTrack={(t) => setCurrentIndex(tracks.findIndex(x => x.id === t.id))}
                  onOpenTrackTool={(t) => setEditingTrack(t)}
                  isShuffle={isShuffle} setIsShuffle={setIsShuffle}
                  isRepeat={isRepeat} setIsRepeat={setIsRepeat}
                  onlyAuxiliary={true}
                />
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <Cartwall 
                  onTriggerTrack={(track) => setTracks([track, ...tracks])} 
                  audioContext={audioSystem.audioContext}
                  mixerDestination={audioSystem.mixerDestination}
                  supabaseUrl={supabaseUrl}
                />
              </div>
            </div>
          </WindowPortal>
        )}

        {isCrossfadeOpen && (
          <CrossfadeConfig 
            settings={crossfadeSettings}
            onSave={(newSettings) => {
              setCrossfadeSettings(newSettings);
              localStorage.setItem('ksm_crossfade_settings', JSON.stringify(newSettings));
              setIsCrossfadeOpen(false);
            }}
            onClose={() => setIsCrossfadeOpen(false)}
          />
        )}
      </div>

      {/* MODAL DE CONFIGURACIÓN */}
      {showConfig && (
        <div className={styles.configOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowConfig(false); }}>
          <div className={styles.configModal}>
            <div className={styles.configModal__header}>
              <span className={styles.configModal__title}>⚙️ CONFIGURACIÓN</span>
              <button className={styles.configModal__closeBtn} onClick={() => setShowConfig(false)}>✕</button>
            </div>
            <div className={styles.configModal__body}>
              <ConfigPanel onBgChange={async () => {
                const result = await (window.electron || (window.require ? window.require('electron') : null))?.ipcRenderer.invoke('open-file-dialog', {
                  properties: ['openFile'],
                  filters: [{ name: 'Imágenes', extensions: ['jpg', 'png', 'jpeg', 'webp'] }],
                  title: 'Seleccionar Imagen de Fondo'
                });
                if (result && !result.canceled && result.filePaths.length > 0) {
                  const bgPath = result.filePaths[0];
                  localStorage.setItem('ksm_custom_bg', bgPath);
                  setCustomBg(bgPath);
                }
              }} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE TANDAS */}
      {isAdsOpen && (
        <div className={styles.configOverlay} onClick={(e) => { if (e.target === e.currentTarget) setIsAdsOpen(false); }}>
          <div className={styles.configModal}>
            <div className={styles.configModal__header}>
              <span className={styles.configModal__title}>📢 PROGRAMADOR DE TANDAS</span>
              <button className={styles.configModal__closeBtn} onClick={() => setIsAdsOpen(false)}>✕</button>
            </div>
            <div className={styles.configModal__body} style={{ height: '70vh' }}>
              <AdScheduler onInjectBlock={(adTracks) => {
                setTracks(prevTracks => {
                  const updated = [...prevTracks];
                  const insertIndex = currentIndexRef.current + 1;
                  updated.splice(insertIndex, 0, ...adTracks);
                  console.log(`[Tanda] Inyectados ${adTracks.length} audios en posición ${insertIndex}`);
                  return updated;
                });
                setAnnouncementMsg(`📢 INYECTANDO TANDA COMERCIAL (${adTracks.length} audios)`);
                setTimeout(() => setAnnouncementMsg(null), 5000);
              }} />
            </div>
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.footer__copyright}>COPYRIGHT @ KSMSERVICIOS 2026</span>
        <span className={styles.footer__version}>KSM AirControl v{packageJson.version}</span>
      </footer>
      <CognitiveWidget 
        currentTrack={tracks[currentIndex] || null} 
        tracksCount={tracks.length}
      />

      {/* LOGO ANIMADO DE LA EMISORA */}
      {enableLogoAnimation && (stationName || stationLogo) && (
        <div className={styles.animatedLogoContainer}>
          <div className={styles.animatedLogoInner}>
            {stationLogo && <img src={`ksm:///${stationLogo.replace(/\\/g, '/')}`} alt="Logo" className={styles.animatedLogoImg} />}
            {stationName && <span className={styles.animatedLogoText}>{stationName}</span>}
            
            {tracks[currentIndex] && (
              <>
                <span className={styles.animatedLogoDivider}>|</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: '4px' }}>
                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', lineHeight: '1.2', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tracks[currentIndex].title || 'Pista desconocida'}
                  </span>
                  <span style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.2', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tracks[currentIndex].artist || 'Artista desconocido'}
                  </span>
                </div>

                {(tracks[currentIndex].picture || tracks[currentIndex].cover) && (
                  <img 
                    src={(tracks[currentIndex].picture || tracks[currentIndex].cover).startsWith('http') || (tracks[currentIndex].picture || tracks[currentIndex].cover).startsWith('data:') ? (tracks[currentIndex].picture || tracks[currentIndex].cover) : `ksm:///${(tracks[currentIndex].picture || tracks[currentIndex].cover).replace(/\\/g, '/')}`} 
                    alt="Cover" 
                    className={styles.animatedTrackCover} 
                    style={{ marginLeft: '8px' }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      <LicenseOverlay />
</div>
  );
}
