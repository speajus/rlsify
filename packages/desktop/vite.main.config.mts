import { defineConfig } from 'vite';

// https://vitejs.dev/config
// Bundle all dependencies except electron and pg (native node modules)
// This ensures ESM-only packages like @speajus/diblob-* are bundled into the output
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'pg',
        'pg-native',
      ],
    },
  },
});

