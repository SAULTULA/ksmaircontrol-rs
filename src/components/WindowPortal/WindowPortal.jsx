import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * WindowPortal crea una nueva ventana usando window.open()
 * y renderiza sus hijos dentro de ella mediante createPortal.
 * También copia automáticamente todas las etiquetas de estilo
 * de la ventana principal para mantener el diseño idéntico.
 */
export default function WindowPortal({ children, onClose, title = "Panel Flotante" }) {
  const [container, setContainer] = useState(null);
  const externalWindow = useRef(null);
  const isUnmounting = useRef(false);

  useEffect(() => {
    isUnmounting.current = false;
    // 1. Crear la nueva ventana con propiedades para Electron
    externalWindow.current = window.open('', '', 'width=500,height=800,alwaysOnTop=1');
    if (!externalWindow.current) {
      console.error("WindowPortal: No se pudo abrir la ventana. Revisa si hay un bloqueador de popups.");
      return;
    }

    externalWindow.current.document.title = title;

    // 2. Crear un div contenedor donde React montará los hijos
    const div = externalWindow.current.document.createElement('div');
    // Para que ocupe toda la ventana y tenga el fondo oscuro de KSM
    div.style.width = '100vw';
    div.style.height = '100vh';
    div.style.overflow = 'auto';
    div.style.backgroundColor = 'var(--bg-dark)';
    div.style.color = 'var(--text-main)';
    externalWindow.current.document.body.appendChild(div);
    
    // Quitar márgenes del body
    externalWindow.current.document.body.style.margin = '0';
    externalWindow.current.document.body.style.padding = '0';
    externalWindow.current.document.body.style.backgroundColor = '#0a0a0c';

    // 3. Copiar todas las hojas de estilo (CSS Modules, inyecciones de Vite)
    const copyStyles = () => {
      const targetHead = externalWindow.current.document.head;
      const sourceHead = window.document.head;
      
      Array.from(sourceHead.querySelectorAll('style, link[rel="stylesheet"]')).forEach(styleNode => {
        targetHead.appendChild(styleNode.cloneNode(true));
      });
    };

    copyStyles();
    
    // Opcional: Escuchar mutaciones en el head por si Vite inyecta estilos tarde
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'STYLE' || (node.tagName === 'LINK' && node.rel === 'stylesheet')) {
            externalWindow.current.document.head.appendChild(node.cloneNode(true));
          }
        });
      });
    });
    observer.observe(window.document.head, { childList: true });

    // 4. Manejar el cierre de la ventana
    externalWindow.current.addEventListener('beforeunload', () => {
      if (!isUnmounting.current && onClose) onClose();
    });

    setContainer(div);

    return () => {
      isUnmounting.current = true;
      observer.disconnect();
      if (externalWindow.current && !externalWindow.current.closed) {
        externalWindow.current.close();
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(children, container);
}
