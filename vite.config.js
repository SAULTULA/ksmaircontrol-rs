import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Fundamental para que las rutas funcionen en Electron y empaquetado local
  server: {
    port: 5173,
    strictPort: true,
  },
});
