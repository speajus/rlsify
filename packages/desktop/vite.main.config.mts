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
        // UI dependencies that should not be bundled in main process
        'runed',
        'esm-env',
        'clsx',
        'style-to-object',
        'tabbable',
        '@internationalized/date',
        '@floating-ui/dom',
        'bits-ui',
        'svelte-jsoneditor',
        'tailwind-merge',
        'tailwind-variants',
      ],
    },
  },
});

