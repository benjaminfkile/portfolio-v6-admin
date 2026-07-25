/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Spec §10: both frontends use Vite's dev proxy rather than pointing at the API
// directly. `/api` is forwarded to the local portfolio-v6-api container on :3002,
// mirroring what the gateway does in production, so CORS never enters the local path.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
