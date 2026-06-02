import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index:           resolve(__dirname, 'index.html'),
        dashboardLoader: resolve(__dirname, 'pages/dashboard/index.html'),
        dashboard:       resolve(__dirname, 'pages/dashboard/dashboard.html'),
        questions:       resolve(__dirname, 'pages/questions/index.html'),
        question:        resolve(__dirname, 'pages/questions/question.html'),
        groups:          resolve(__dirname, 'pages/groups/index.html'),
        accounts:        resolve(__dirname, 'pages/accounts/index.html'),
        stocks:          resolve(__dirname, 'pages/stocks/index.html'),
        settings:        resolve(__dirname, 'pages/settings/index.html'),
        homepage:        resolve(__dirname, 'pages/homepage/index.html'),
      }
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@lib':    resolve(__dirname, 'src/lib'),
    }
  }
});
