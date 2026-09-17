import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend has no CORS middleware on purpose (nothing browser-facing
// exists in production yet), so the dev server serves the console and
// proxies every backend prefix same-origin. ws: true forwards the HTTP
// Upgrade for /v1/stream with its query string (which carries the
// signature) untouched.
const target = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target },
      '/admin': { target },
      '/healthz': { target },
      '/v1': { target, ws: true },
    },
  },
});
