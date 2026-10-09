import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: '../prototipo', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
