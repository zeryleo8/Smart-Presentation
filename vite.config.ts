import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path' // 引入 path 模块

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 配置路径别名
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
      }
    }
  },
  server: {
    host: true, // 监听所有地址
    proxy: {
      // 1. 捕获所有以 /api-gotenberg 开头的请求
      '/api-gotenberg': {
        // 2. 转发目标地址 (Gotenberg 容器地址)
        target: 'http://localhost:3001',
        // 3. 修改请求头中的 Origin 字段，欺骗后端
        changeOrigin: true,
        // 4. 路径重写：把 /api-gotenberg 替换为空字符串
        // 例如：/api-gotenberg/forms/... -> http://localhost:3000/forms/...
        rewrite: (path) => path.replace(/^\/api-gotenberg/, '')
      }
    }
  }
})