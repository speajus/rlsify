import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';

const uiLibPath = path.resolve(__dirname, '../ui/src/lib');

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    svelte({
      // Compile lucide-svelte components (they're Svelte 4 style, not runes)
      compilerOptions: {
        // Allow legacy component syntax for lucide-svelte
        compatibility: {
          componentApi: 4,
        },
      },
    }),
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      // Use the UI package's lib source directly
      '@ui': uiLibPath,
      // SvelteKit's $lib alias - point to the UI package's lib directory
      '$lib': uiLibPath,
    },
  },
  optimizeDeps: {
    // Include lucide-svelte in pre-bundling so it gets processed
    include: ['lucide-svelte'],
  },
  build: {
    rollupOptions: {
      input: {
        main_window: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});

