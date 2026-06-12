import React, { useState, useRef, useEffect } from 'react';
import styles from './Playlist.module.css';

export default function Playlist({ 
  tracks, 
  setTracks, 
  currentTrackId, 
  onSelectTrack, 
  onOpenTrackTool,
  isShuffle,
  setIsShuffle,
  isRepeat,
  setIsRepeat,
  mainPlayerComponent,
  hideAuxiliary = false,
  onlyAuxiliary = false
}) {
  // Cuando es onlyAuxiliary, queremos que el tab por defecto sea el primer auxiliar (si existe)
  // Como `tabs` es state, lo manejaremos en un useEffect o derivado.
  const [activeTab, setActiveTab] = useState(onlyAuxiliary ? null : 'main');
  const [tabs, setTabs] = useState([{ id: 'main', name: 'PAUTA PRINCIPAL' }]);
  const [editingTabId, setEditingTabId] = useState(null);
  const [isCreatingTab, setIsCreatingTab] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedTracks, setSchedTracks] = useState([]);
  const [schedName, setSchedName] = useState('');
  const [schedTime1, setSchedTime1] = useState('');
  const [schedTime2, setSchedTime2] = useState('');
  const [schedDays, setSchedDays] = useState({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
  const schedFileInputRef = useRef(null);
  const schedFolderInputRef = useRef(null);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleSchedFilesUpload = (e) => {
    const files = Array.from(e.target.files).filter(f => {
      const isAudio = f.type.startsWith('audio/') || 
        /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|aiff|aif)$/i.test(f.name);
      return isAudio;
    });
    if (files.length === 0) return;
    const newTracks = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      title: f.name.replace(/\.[^/.]+$/, ""),
      artist: 'Desconocido',
      duration: 0,
      filePath: f.path,
      type: 'music'
    }));
    setSchedTracks([...schedTracks, ...newTracks]);
  };

  const handleFilesUpload = (e) => {
    const files = Array.from(e.target.files).filter(f => {
      const isAudio = f.type.startsWith('audio/') || 
        /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|aiff|aif)$/i.test(f.name);
      return isAudio;
    });
    if (files.length === 0) return;
    const newTracks = files.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      title: f.name.replace(/\.[^/.]+$/, ""),
      artist: 'Desconocido',
      duration: 0,
      nativeFile: f,
      filePath: f.path,
      type: 'music',
      tabCategory: activeTab
    }));
    setTracks([...tracks, ...newTracks]);
  };

  const handleAddTab = () => {
    setNewTabName('');
    setIsCreatingTab(true);
  };

  const confirmNewTab = () => {
    const name = newTabName.trim();
    if (name) {
      const newId = 'tab_' + Date.now();
      setTabs(prev => [...prev, { id: newId, name: name.toUpperCase() }]);
      setActiveTab(newId);
    }
    setIsCreatingTab(false);
    setNewTabName('');
  };

  const moveTrack = (e, index, direction) => {
    e.stopPropagation();
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;
    const updated = [...tracks];
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    setTracks(updated);
  };



  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      
      // BORRAR (Supr / Backspace)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        setTracks(tracks.filter(t => !selectedIds.includes(t.id)));
        setSelectedIds([]);
      }

      // REPRODUCIR (Enter)
      if (e.key === 'Enter' && selectedIds.length > 0) {
        e.preventDefault();
        const firstSelected = visibleTracks.find(t => t.id === selectedIds[0]);
        if (firstSelected && onSelectTrack) {
          onSelectTrack(firstSelected);
          window.dispatchEvent(new CustomEvent('ksm-brain-play'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, tracks, setTracks]);

  const handleRowClick = (e, track) => {
    if (e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(track.id)) {
        setSelectedIds(selectedIds.filter(id => id !== track.id));
      } else {
        setSelectedIds([...selectedIds, track.id]);
      }
    } else if (e.shiftKey && selectedIds.length > 0) {
      // Selección de rango (Shift + Click)
      const lastId = selectedIds[selectedIds.length - 1];
      const startIdx = visibleTracks.findIndex(t => t.id === lastId);
      const endIdx = visibleTracks.findIndex(t => t.id === track.id);
      const range = visibleTracks.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
      setSelectedIds([...new Set([...selectedIds, ...range.map(t => t.id)])]);
    } else {
      setSelectedIds([track.id]);
    }
  };

  const handleRowDoubleClick = (track) => {
    setSelectedIds([track.id]);
    if (onSelectTrack) onSelectTrack(track);
    // Forzar play inmediato
    window.dispatchEvent(new CustomEvent('ksm-brain-play'));
  };

  const visibleTabs = tabs.filter(tab => {
    if (hideAuxiliary) return tab.id === 'main';
    if (onlyAuxiliary) return tab.id !== 'main';
    return true;
  });

  // Asegurar que activeTab sea válido si cambió el modo
  useEffect(() => {
    if (onlyAuxiliary && activeTab === 'main') {
      const firstAux = visibleTabs[0];
      if (firstAux) setActiveTab(firstAux.id);
    } else if (hideAuxiliary && activeTab !== 'main') {
      setActiveTab('main');
    } else if (!activeTab && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [hideAuxiliary, onlyAuxiliary, tabs, activeTab]);

  const visibleTracks = tracks.filter(t => (t.tabCategory || 'main') === activeTab);

  return (
    <div className={styles.playlistWrapper}>
      <div className={styles.playlist__tabsGroup}>
        <div className={styles.tabsContainer}>
          {visibleTabs.map(tab => (
            <div 
              key={tab.id} 
              className={`${styles.tabItem} ${activeTab === tab.id ? styles['tabItem--active'] : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => setEditingTabId(tab.id)}
            >
              {editingTabId === tab.id ? (
                <input 
                  autoFocus 
                  className={styles.tabInput}
                  defaultValue={tab.name} 
                  onBlur={(e) => {
                    setTabs(tabs.map(t => t.id === tab.id ? { ...t, name: e.target.value.toUpperCase() } : t));
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                />
              ) : (
                <span>{tab.name}</span>
              )}
              {visibleTabs.length > 1 && activeTab === tab.id && (
                <button className={styles.closeTab} onClick={(e) => {
                  e.stopPropagation();
                  setTabs(tabs.filter(t => t.id !== tab.id));
                  setTracks(tracks.filter(t => t.tabCategory !== tab.id));
                  const remaining = visibleTabs.filter(t => t.id !== tab.id);
                  setActiveTab(remaining.length > 0 ? remaining[0].id : null);
                }}>✕</button>
              )}
            </div>
          ))}
          {isCreatingTab && (
            <div className={styles.tabItem}>
              <input
                autoFocus
                className={styles.tabInput}
                value={newTabName}
                placeholder="Nombre..."
                onChange={(e) => setNewTabName(e.target.value)}
                onBlur={confirmNewTab}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNewTab();
                  if (e.key === 'Escape') { setIsCreatingTab(false); setNewTabName(''); }
                }}
              />
            </div>
          )}
          <button className={styles.addTabBtn} onClick={handleAddTab} title="Nueva lista auxiliar">+</button>
        </div>
      </div>

      <div className={styles.playlist__header}>
        <div className={styles.playlist__brand}>
          <span className={styles.playlist__count}>{visibleTracks.length} PISTAS</span>
          
          {/* BOTONES DE MODO: SHUFFLE Y REPEAT */}
          <div className={styles.modeControls}>
            <button 
              className={`${styles.modeToggle} ${isShuffle ? styles['modeToggle--active'] : ''}`}
              onClick={() => setIsShuffle(!isShuffle)}
              title="Modo Aleatorio"
            >
              🔀
            </button>
            <button 
              className={`${styles.modeToggle} ${isRepeat ? styles['modeToggle--active'] : ''}`}
              onClick={() => setIsRepeat(!isRepeat)}
              title="Repetir Playlist"
            >
              🔁
            </button>
          </div>
        </div>
        
        <div className={styles.playlist__actions}>
          <input type="file" ref={fileInputRef} multiple accept="audio/*" onChange={handleFilesUpload} style={{ display: 'none' }} />
          <input type="file" ref={folderInputRef} webkitdirectory="true" directory="true" multiple onChange={handleFilesUpload} style={{ display: 'none' }} />
          
          <button className={styles.playlist__btn} onClick={() => fileInputRef.current?.click()}>+ ARCHIVOS</button>
          <button className={styles.playlist__btn} onClick={() => folderInputRef.current?.click()}>📁 CARPETAS</button>
          
          {/* NUEVOS BOTONES DE GESTIÓN */}



          <button 
            className={styles.playlist__btn} 
            onClick={() => {
              const now = new Date();
              const hours = now.getHours().toString().padStart(2, '0');
              const minutes = now.getMinutes().toString().padStart(2, '0');
              setSchedTime1(`${hours}:${minutes}`);
              setSchedTime2('');
              setSchedDays({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true });
              setShowScheduler(true);
            }}
          >
            📅 PROGRAMAR
          </button>

          <button 
            className={`${styles.playlist__btn} ${styles['playlist__btn--danger']}`} 
            onClick={() => {
              if (confirm('¿Está seguro de limpiar toda la pauta actual?')) {
                setTracks(tracks.filter(t => (t.tabCategory || 'main') !== activeTab));
                setSelectedIds([]);
              }
            }}
            title="Eliminar todas las pistas de la lista actual"
          >
            🗑️ LIMPIAR PAUTA
          </button>
        </div>
      </div>

      <div className={styles.playlist__body}>
        {visibleTracks.map((track, idx) => {
          const isPlaying = track.id === currentTrackId;
          const isSelected = selectedIds.includes(track.id);
          const realIndex = tracks.findIndex(t => t.id === track.id);
          return (
            <div 
              key={track.id} 
              className={`${styles.row} ${isPlaying ? styles['row--playing'] : ''} ${isSelected ? styles['row--selected'] : ''}`} 
              onClick={(e) => handleRowClick(e, track)}
              onDoubleClick={() => handleRowDoubleClick(track)}
            >
              <div className={styles.row__status}>
                {isPlaying ? <span className={styles.statusDot} /> : <span className={styles.row__num}>{(idx + 1).toString().padStart(2, '0')}</span>}
              </div>
              <div className={styles.row__type}>
                <span className={`${styles.typeBadge} ${styles['typeBadge--' + track.type]}`}>{track.type.substring(0,3).toUpperCase()}</span>
              </div>
              <div className={styles.row__meta}>
                <span className={styles.row__title}>{track.title}</span>
                <span className={styles.row__artist}>{track.artist}</span>
              </div>
              <div className={styles.row__tools}>
                <button className={styles.toolBtn} onClick={(e) => { e.stopPropagation(); onOpenTrackTool?.(track); }}>✂️ CUE</button>
              </div>
              <div className={styles.row__order}>
                <button className={styles.orderBtn} onClick={(e) => moveTrack(e, realIndex, -1)} disabled={idx === 0}>▲</button>
                <button className={styles.orderBtn} onClick={(e) => moveTrack(e, realIndex, 1)} disabled={idx === visibleTracks.length - 1}>▼</button>
              </div>
              <div className={styles.row__duration}>
                <span>{track.duration ? `${Math.floor(track.duration / 60)}:${Math.floor(track.duration % 60).toString().padStart(2, '0')}` : '--:--'}</span>
              </div>
            </div>
          );
        })}
        {visibleTracks.length === 0 && <div className={styles.emptyState}>SIN PISTAS EN ESTA LISTA</div>}
      </div>

      <div className={styles.dockedPlayerContainer}>
        {mainPlayerComponent}
      </div>

      {/* ========================================== */}
      {/* 🖥️ PANEL DE PROGRAMACIÓN INDEPENDIENTE     */}
      {/* ========================================== */}
      {showScheduler && (
        <div className={styles.modalOverlay}>
          <div className={styles.schedulerCard}>
            <div className={styles.modalHeader}>
              <h3>🛠️ CREADOR DE PLAYLIST PROGRAMADA</h3>
              <button className={styles.closeBtn} onClick={() => setShowScheduler(false)}>✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formRow}>
                <div className={styles.inputGroup}>
                  <label>NOMBRE DE LA PLAYLIST</label>
                  <input 
                    type="text" 
                    value={schedName} 
                    onChange={e => setSchedName(e.target.value.toUpperCase())} 
                    placeholder="Ej: MAÑANA"
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>HORA DE INICIO (H1)</label>
                  <input 
                    type="time" 
                    value={schedTime1} 
                    onChange={e => setSchedTime1(e.target.value)} 
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label>REPETICIÓN (H2) Opcional</label>
                  <input 
                    type="time" 
                    value={schedTime2} 
                    onChange={e => setSchedTime2(e.target.value)} 
                  />
                </div>
              </div>

              {/* DÍAS DE LA SEMANA */}
              <div className={styles.daysGridSection}>
                <label>DÍAS DE LA SEMANA</label>
                <div style={{ display: 'flex', gap: '15px', padding: '10px', background: 'var(--bg-deck)', border: '1px solid var(--border-panel)', borderRadius: '4px' }}>
                  {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((letter, idx) => (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: schedDays[idx] ? 'var(--color-active)' : 'var(--text-muted)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={!!schedDays[idx]} 
                        onChange={() => setSchedDays(prev => ({ ...prev, [idx]: !prev[idx] }))} 
                      />
                      {letter}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.schedulerActions}>
                <input type="file" ref={schedFileInputRef} multiple accept="audio/*" onChange={handleSchedFilesUpload} style={{ display: 'none' }} />
                <input type="file" ref={schedFolderInputRef} webkitdirectory="true" directory="true" multiple onChange={handleSchedFilesUpload} style={{ display: 'none' }} />
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={styles.playlist__btn} onClick={() => schedFileInputRef.current?.click()}>+ ARCHIVOS</button>
                  <button className={styles.playlist__btn} onClick={() => schedFolderInputRef.current?.click()}>📁 CARPETA</button>
                </div>
                <span className={styles.tracksCount}>{schedTracks.length} temas cargados</span>
              </div>

              <div className={styles.schedulerList}>
                {schedTracks.length === 0 ? (
                  <div className={styles.emptyList}>Carga las canciones que sonarán en este horario...</div>
                ) : (
                  schedTracks.map((t, idx) => (
                    <div key={t.id} className={styles.schedRow}>
                      <span>{idx + 1}. {t.title}</span>
                      <button onClick={() => setSchedTracks(schedTracks.filter(st => st.id !== t.id))}>✕</button>
                    </div>
                  ))
                )}
              </div>
              
              {/* LISTA DE PROGRAMACIONES ACTIVAS */}
              <div className={styles.activeSchedulesSection}>
                <label>🗓️ PROGRAMACIONES ACTIVAS (En esta PC)</label>
                <div className={styles.activeSchedulesList}>
                  {(() => {
                    const keys = Object.keys(localStorage).filter(k => k.startsWith('ksm_schedule_'));
                    if (keys.length === 0) return <div className={styles.emptySchedules}>No hay listas programadas.</div>;
                    return keys.map(key => {
                      const name = key.replace('ksm_schedule_', '');
                      const schedDataStr = localStorage.getItem(key);
                      let parsedSched = null;
                      try {
                        parsedSched = JSON.parse(schedDataStr);
                      } catch(e) {
                        // Soporte legacy por si existia 1 sola hora en string
                        parsedSched = { time1: schedDataStr, time2: '', days: { 0:true,1:true,2:true,3:true,4:true,5:true,6:true } };
                      }
                      const activeDays = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
                        .filter((_, idx) => parsedSched.days && parsedSched.days[idx])
                        .join(',');
                      
                      return (
                        <div key={key} className={styles.scheduleItem}>
                          <span>🕒 {parsedSched.time1} {parsedSched.time2 ? `| ${parsedSched.time2}` : ''} hs [{activeDays}] — 🎵 {name}</span>
                          <button 
                            className={styles.deleteScheduleBtn}
                            onClick={() => {
                              if (confirm(`¿Eliminar la programación de "${name}"?`)) {
                                localStorage.removeItem(key);
                                localStorage.removeItem(`ksm_playlist_${name}`);
                                alert(`Programación "${name}" eliminada.`);
                              }
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setShowScheduler(false)}>CANCELAR</button>
              <button 
                className={styles.saveBtn} 
                onClick={() => {
                  if (!schedName || !schedTime1) {
                    alert("Por favor completa el nombre y el Horario 1.");
                    return;
                  }
                  // Guardar la playlist
                  const playlistData = { name: schedName, tracks: schedTracks };
                  localStorage.setItem(`ksm_playlist_${schedName}`, JSON.stringify(playlistData));
                  // Guardar la programación (NUEVO FORMATO JSON)
                  const schedObj = {
                    time1: schedTime1,
                    time2: schedTime2,
                    days: schedDays
                  };
                  localStorage.setItem(`ksm_schedule_${schedName}`, JSON.stringify(schedObj));
                  
                  alert(`Playlist "${schedName}" guardada y programada.`);
                  setShowScheduler(false);
                  setSchedTracks([]);
                  setSchedName('');
                  setSchedTime1('');
                  setSchedTime2('');
                }}
              >
                GUARDAR Y PROGRAMAR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
