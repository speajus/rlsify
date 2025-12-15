import { defineConfig } from 'vite';

// https://vitejs.dev/config
// Electron preload scripts MUST be CommonJS format
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron'],
      output: {
        format: 'cjs',
      },
    },
  },
});

