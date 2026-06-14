import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // Tauri 开发时用固定端口
  server: {
    port: 5173,
    strictPort: true,
  },
  // 让构建产物兼容 Tauri
  build: {
    target: 'esnext',
  },
})
