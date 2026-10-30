import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site talks to backend-v2 under /v2, same-origin, so the backend needs
// no CORS. In production nginx maps /v2/ to the Parent API's /v1/ and
// /v2/device to the toy socket; in development this proxy does the same
// against `npm run dev:lite` (or `npm run dev`) in backend-v2.
const api = process.env.BACKEND_V2_URL || 'http://localhost:3100';
const voice = process.env.BACKEND_V2_VOICE_URL || 'http://localhost:3101';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      // First, so the toy socket is not taken for an API path. A plain key is
      // a prefix match, and '/v2/device' would also take GET /v2/devices to
      // the voice service; a key starting with ^ is a RegExp, which pins the
      // socket's exact path, as nginx's `location = /v2/device` does.
      '^/v2/device(?:[?#]|$)': { target: voice, ws: true, rewrite: (p) => p.replace(/^\/v2\/device/, '/v1/device') },
      '/v2': { target: api, rewrite: (p) => p.replace(/^\/v2/, '/v1') },
    },
  },
});
