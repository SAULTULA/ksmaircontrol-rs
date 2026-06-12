import React, { useState, useEffect } from 'react';
import styles from './AdScheduler.module.css';

const electron = window.electron || (window.require ? window.require('electron') : null);

// Programador Avanzado de Tandas Publicitarias (Control Manual Total)
export default function AdScheduler({ onInjectBlock }) {
  const [blocks, setBlocks] = useState([]); 
  const [newTime, setNewTime] = useState('10:00');
  const [newName, setNewName] = useState('');
  const [isAutoMode, setIsAutoMode] = useState(true); // Control de confirmación manual

  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-adblocks').then(savedBlocks => {
        if (savedBlocks && savedBlocks.length > 0) {
          // Migración automática a nuevo modelo
          const migrated = savedBlocks.map(b => ({
            ...b,
            days: b.days || { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
            time1: b.time1 !== undefined ? b.time1 : (b.time || ''),
            time2: b.time2 || '',
            triggeredTime1Today: b.triggeredTime1Today || b.triggeredToday || false,
            triggeredTime2Today: b.triggeredTime2Today || false
          }));
          setBlocks(migrated);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (electron && blocks.length > 0) {
      electron.ipcRenderer.invoke('db-save-adblocks', blocks);
    }
  }, [blocks]);

  useEffect(() => {
    const handleInject = (e) => {
      const blockName = e.detail;
      const found = blocks.find(b => b.name.toLowerCase() === blockName.toLowerCase()) || blocks[0];
      if (found) {
        handleManualInject(found);
      } else {
        alert(`No se encontró la tanda comercial '${blockName}'.`);
      }
    };
    window.addEventListener('ksm-brain-inject-ad', handleInject);
    return () => window.removeEventListener('ksm-brain-inject-ad', handleInject);
  }, [blocks, onInjectBlock]);

  // 1. CARGA DE AUDIOS REALES
  const handleAddItems = (blockId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      const newItems = files.map(f => ({
        id: 'ad_' + Math.random().toString(36).substr(2, 9),
        title: f.name.replace(/\.[^/.]+$/, ""),
        file: f,
        filePath: f.path
      }));

      setBlocks(prev => prev.map(b => 
        b.id === blockId ? { ...b, items: [...b.items, ...newItems] } : b
      ));
    };
    input.click();
  };

  // 2. EDICIÓN MANUAL DE HORARIOS EXISTENTES
  const handleEditTime1 = (blockId, updatedTime) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, time1: updatedTime, triggeredTime1Today: false } : b
    ).sort((a, b) => (a.time1 || '').localeCompare(b.time1 || '')));
  };

  const handleEditTime2 = (blockId, updatedTime) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, time2: updatedTime, triggeredTime2Today: false } : b
    ));
  };

  const handleToggleDay = (blockId, dayIndex) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, days: { ...b.days, [dayIndex]: !b.days[dayIndex] } } : b
    ));
  };

  const handleCreateBlock = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newBlock = {
      id: 'blk_' + Date.now(),
      time1: newTime,
      time2: '',
      name: newName.trim(),
      items: [],
      days: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
      triggeredTime1Today: false,
      triggeredTime2Today: false
    };

    setBlocks(prev => [...prev, newBlock].sort((a, b) => a.time1.localeCompare(b.time1)));
    setNewName('');
  };

  const handleDeleteBlock = (id) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const handleManualInject = (block) => {
    if (!onInjectBlock || block.items.length === 0) {
      alert("La tanda está vacía.");
      return;
    }
    
    const adTracks = block.items.map((item, idx) => ({
      id: `inj_ad_${block.id}_${idx}_${Date.now()}`,
      title: item.title,
      artist: 'TANDA COMERCIAL',
      nativeFile: item.file,
      filePath: item.filePath,
      type: 'voice',
      mixPointPercent: 95
    }));

    onInjectBlock(adTracks, block.name);
  };

  // 3. MONITOR DE TIEMPO (SCHEDULER)
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Domingo
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      blocks.forEach(b => {
        // ¿Está habilitada para hoy?
        if (!b.days[currentDay]) return;

        // Validar Horario 1
        if (b.time1 === currentTime && !b.triggeredTime1Today && b.items.length > 0) {
          if (isAutoMode) {
            handleManualInject(b);
          } else {
            if (confirm(`🔔 ES HORA DE LA TANDA: "${b.name}" (Horario 1)\n\n¿Desea lanzarla al aire ahora?`)) handleManualInject(b);
          }
          setBlocks(prev => prev.map(pb => pb.id === b.id ? { ...pb, triggeredTime1Today: true } : pb));
        }

        // Validar Horario 2
        if (b.time2 && b.time2 === currentTime && !b.triggeredTime2Today && b.items.length > 0) {
          if (isAutoMode) {
            handleManualInject(b);
          } else {
            if (confirm(`🔔 ES HORA DE LA TANDA: "${b.name}" (Horario 2)\n\n¿Desea lanzarla al aire ahora?`)) handleManualInject(b);
          }
          setBlocks(prev => prev.map(pb => pb.id === b.id ? { ...pb, triggeredTime2Today: true } : pb));
        }
      });

      if (currentTime === "00:00") {
        setBlocks(prev => prev.map(b => ({ ...b, triggeredTime1Today: false, triggeredTime2Today: false })));
      }
    };

    const timer = setInterval(checkTime, 10000); // Revisión cada 10s
    return () => clearInterval(timer);
  }, [blocks, isAutoMode]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.title}>PROGRAMADOR TANDAS</span>
          <div className={styles.modeToggle} onClick={() => setIsAutoMode(!isAutoMode)}>
            <div className={`${styles.toggleDot} ${isAutoMode ? styles['toggleDot--active'] : ''}`} />
            <span>{isAutoMode ? 'AUTO' : 'CONFIRMACIÓN MANUAL'}</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {/* CREADOR */}
        <form className={styles.creator} onSubmit={handleCreateBlock}>
          <input 
            type="time" 
            className={styles.creator__time}
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            required
          />
          <input 
            type="text" 
            placeholder="Nueva Tanda..."
            className={styles.creator__name}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button type="submit" className={styles.creator__btn}>AÑADIR</button>
        </form>

        {/* LISTADO */}
        <div className={styles.blockList}>
          {blocks.map(block => (
            <div key={block.id} className={styles.block}>
              <div className={styles.blockMain}>
                <div className={styles.timeInputsGroup}>
                  <div className={styles.timeInputWrapper}>
                    <span className={styles.timeLabel}>H1:</span>
                    <input 
                      type="time" 
                      className={styles.blockTimeEdit}
                      value={block.time1 || ''}
                      onChange={(e) => handleEditTime1(block.id, e.target.value)}
                    />
                  </div>
                  <div className={styles.timeInputWrapper}>
                    <span className={styles.timeLabel}>H2:</span>
                    <input 
                      type="time" 
                      className={styles.blockTimeEdit}
                      value={block.time2 || ''}
                      onChange={(e) => handleEditTime2(block.id, e.target.value)}
                    />
                  </div>
                </div>
                <span className={styles.blockName}>{block.name}</span>
                <button className={styles.delBtn} onClick={() => handleDeleteBlock(block.id)}>✕</button>
              </div>

              {/* DÍAS DE LA SEMANA */}
              <div className={styles.daysSelector}>
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((letter, idx) => (
                  <label key={idx} className={`${styles.dayLabel} ${block.days && block.days[idx] ? styles.dayActive : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={!!(block.days && block.days[idx])} 
                      onChange={() => handleToggleDay(block.id, idx)} 
                      className={styles.hiddenCheckbox} 
                    />
                    {letter}
                  </label>
                ))}
              </div>

              {block.items.length > 0 && (
                <div className={styles.itemArea}>
                  {block.items.map(it => <div key={it.id} className={styles.itemRow}>• {it.title}</div>)}
                </div>
              )}

              <div className={styles.blockFooter}>
                <span className={styles.stats}>{block.items.length} audios</span>
                <button className={styles.addAudiosBtn} onClick={() => handleAddItems(block.id)}>+ CARGAR AUDIOS</button>
                <button className={styles.goBtn} onClick={() => handleManualInject(block)}>⚡ LANZAR</button>
              </div>
            </div>
          ))}
          {blocks.length === 0 && <div className={styles.empty}>NO HAY BLOQUES PROGRAMADOS</div>}
        </div>
      </div>
    </div>
  );
}
