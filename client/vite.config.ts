import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Im Dev-Modus leitet Vite alle API- und Socket-Anfragen an das Express-Backend weiter.
// So laufen Frontend und Backend für den Browser auf demselben Origin (Cookies funktionieren ohne CORS).
const BACKEND = process.env.OSSXP_BACKEND ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND,
      '/socket.io': { target: BACKEND, ws: true },
    },
  },
});
