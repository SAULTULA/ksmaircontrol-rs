import React, { useState, useEffect, useRef } from 'react';
import styles from './Cartwall.module.css';
import { resolveAudioUrl } from '../../utils/audioUrl';

// Cartuchera de efectos instantáneos (Cart Wall) con carga real
export default function Cartwall({ audioContext, mixerDestination, supabaseUrl }) {
  const [carts, setCarts] = useState(
    Array.from({ length: 12 }, (_, i) => ({
      id: `c${i+1}`,
      title: 'VACÍO',
      shortcut: `F${i+1}`,
      isPlaying: false,
      nativeFile: null,
      filePath: null,
      audioObj: null,
      sourceNode: null
    }))
  );

  const electron = window.electron || (window.require ? window.require('electron') : null);

  /*
  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('db-get-cartwall').then(savedCarts => {
        if (savedCarts && savedCarts.length > 0) {
          setCarts(prev => prev.map(c => {
            const saved = savedCarts.find(sc => sc.id === c.id);
            return saved ? { ...c, title: saved.title, filePath: saved.filePath } : c;
          }));
        }
      });
    }
  }, []);

  useEffect(() => {
    if (electron) {
      electron.ipcRenderer.invoke('db-save-cartwall', carts);
    }
  }, [carts]);
  */

  const handleDeleteSlot = (e, index) => {
    e.stopPropagation();
    const cart = carts[index];
    if (cart.isPlaying && cart.audioObj) {
      try {
        cart.audioObj.pause();
        cart.audioObj.currentTime = 0;
        if (cart.sourceNode) cart.sourceNode.disconnect();
      } catch (err) {}
    }
    updateCartState(index, {
      title: 'VACÍO',
      nativeFile: null,
      filePath: null,
      isPlaying: false,
      audioObj: null,
      sourceNode: null
    });
  };

  const fileInputRef = useRef(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState(null);

  const handleSlotClick = (index) => {
    const cart = carts[index];

    if (!cart.nativeFile && !cart.filePath) {
      setActiveSlotIndex(index);
      fileInputRef.current.click();
      return;
    }

    // Reproducción real con ruteo a Emisión
    if (cart.isPlaying && cart.audioObj) {
      try {
        cart.audioObj.pause();
        cart.audioObj.currentTime = 0;
        if (cart.sourceNode) cart.sourceNode.disconnect();
      } catch (e) {}
      updateCartState(index, { isPlaying: false, audioObj: null, sourceNode: null });
    } else {
      let url = '';
      if (cart.nativeFile) {
        url = URL.createObjectURL(cart.nativeFile);
      } else if (cart.filePath) {
        url = resolveAudioUrl(cart.filePath, supabaseUrl);
      }
      
      if (url) {
        const audio = new Audio(url);
        let node = null;

        if (audioContext && mixerDestination) {
          try {
            node = audioContext.createMediaElementSource(audio);
            node.connect(mixerDestination);
          } catch (err) {
            console.warn("Error ruteando audio de cartuchera:", err);
          }
        }

        audio.onended = () => {
          if (node) { try { node.disconnect(); } catch(e){} }
          updateCartState(index, { isPlaying: false, audioObj: null, sourceNode: null });
        };

        audio.play().catch(console.error);
        updateCartState(index, { isPlaying: true, audioObj: audio, sourceNode: node });
      }
    }
  };

  const updateCartState = (index, newState) => {
    setCarts(prev => {
      const updated = prev.map((c, i) => i === index ? { ...c, ...newState } : c);
      const isAnyPlaying = updated.some(c => c.isPlaying);
      window.dispatchEvent(new CustomEvent('ksm-cart-ducking', { detail: isAnyPlaying }));
      return updated;
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && activeSlotIndex !== null) {
      updateCartState(activeSlotIndex, {
        title: file.name.replace(/\.[^/.]+$/, "").substring(0, 15),
        nativeFile: file
      });
    }
    e.target.value = null;
  };

  return (
    <div className={styles.cartwallWrapper}>
      <div className={styles.cartwall__header}>
        <span className={styles.cartwall__title}>CART WALL • INSERCIÓN RÁPIDA</span>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="audio/*" 
        onChange={handleFileChange} 
      />

      <div className={styles.cartwall__grid}>
        {carts.map((cart, index) => (
          <div 
            key={cart.id} 
            className={`${styles.cart} ${cart.isPlaying ? styles['cart--playing'] : ''} ${!cart.nativeFile && !cart.filePath ? styles['cart--empty'] : ''}`}
            onClick={() => handleSlotClick(index)}
          >
            <span className={styles.cart__shortcut}>{cart.shortcut}</span>
            <div className={styles.cart__title}>{cart.title}</div>
            {!cart.nativeFile && !cart.filePath && <div className={styles.cart__loadHint}>CLIC PARA CARGAR</div>}
            {(cart.nativeFile || cart.filePath) && (
              <button
                className={styles.cart__deleteBtn}
                onClick={(e) => handleDeleteSlot(e, index)}
                title="Vaciar este slot"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
