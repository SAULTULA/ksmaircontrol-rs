import React, { useEffect, useRef } from 'react';

// Detector de Silencio (Rescue Monitor) - Sin UI, solo lógica de background
export default function SilenceDetector({ 
  audioContext, 
  emissionNode, 
  enabled, 
  timeoutSeconds, 
  onSilenceDetected 
}) {
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const silenceStartRef = useRef(null);

  useEffect(() => {
    if (!enabled || !audioContext || !emissionNode) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      return;
    }

    // Configurar el Analyser Node
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    emissionNode.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkSilence = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calcular volumen promedio (RMS simple)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Consideramos "Silencio" si el promedio es menor a 2 (muy bajo nivel)
      if (average < 2) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        } else {
          const elapsedSeconds = (Date.now() - silenceStartRef.current) / 1000;
          if (elapsedSeconds >= timeoutSeconds) {
            console.warn(`[SilenceDetector] 🚨 ¡Alarma! Silencio detectado por más de ${timeoutSeconds}s.`);
            silenceStartRef.current = null; // Reset para evitar spam
            if (onSilenceDetected) onSilenceDetected();
          }
        }
      } else {
        // Hay audio, reseteamos el contador
        silenceStartRef.current = null;
      }

      animationRef.current = requestAnimationFrame(checkSilence);
    };

    checkSilence();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch(e) {}
        analyserRef.current = null;
      }
    };
  }, [enabled, audioContext, emissionNode, timeoutSeconds, onSilenceDetected]);

  return null; // Componente fantasma, no renderiza nada
}
