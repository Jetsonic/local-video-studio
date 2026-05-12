import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'client',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
      '/media': { target: 'http://localhost:3100', changeOrigin: true },
      '/audio': { target: 'http://localhost:3100', changeOrigin: true },
      '/compiled': { target: 'http://localhost:3100', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3100', ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'client') },
  },
})
