import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    port: 5174,
    host: true, // 同时监听 127.0.0.1 与局域网，手机也能扫码预览
    open: false
  }
})
