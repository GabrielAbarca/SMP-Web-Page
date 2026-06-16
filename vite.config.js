import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        login: resolve(__dirname, 'admin.html'),
      }
    }
  }
});
