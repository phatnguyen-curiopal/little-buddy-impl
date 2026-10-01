import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend has no CORS on purpose; in development the site talks to it
// same-origin through this proxy. In production a reverse proxy does the
// same job, so the app never needs to know the API's host. /v1 carries the
// web toy: /v1/time over HTTP and the signed /v1/stream WebSocket upgrade.
const target = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target },
      '/v1': { target, ws: true },
    },
  },
});
