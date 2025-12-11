import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5174,
    proxy: {
      // Proxy Connect/gRPC requests to the backend service
      // Connect-ES uses paths like /rlsify.v1.SchemaService/GetSchema
      '/rlsify.v1': {
        target: process.env.VITE_API_BACKEND || 'http://service:50051',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});

