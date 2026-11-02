import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { port: 5191, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
