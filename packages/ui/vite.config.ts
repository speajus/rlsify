import path from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      // Proxy Connect/gRPC requests to the backend service
      // Connect-ES uses paths like /rlsify.v1.SchemaService/GetSchema
      '/rlsify.v1': {
        target: process.env.VITE_API_BACKEND || 'http://localhost:50051',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});

