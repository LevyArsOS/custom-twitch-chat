import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/runtime',
    emptyOutDir: false,
    target: 'es2020',
    lib: {
      entry: 'src/overlay/main.js',
      name: 'CustomTwitchChat',
      formats: ['iife'],
      fileName: () => 'overlay.js',
    },
  },
});
