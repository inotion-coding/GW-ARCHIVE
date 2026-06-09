import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/GW-ARCHIVE/',
  worker: {
    format: 'iife',   // Classic Worker — importScripts() 지원 (MediaPipe WASM 로더 필요)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist'))   return 'pdf'
          if (id.includes('xlsx'))         return 'xlsx'
          if (id.includes('mammoth'))      return 'mammoth'
          if (id.includes('jszip'))        return 'jszip'
          if (id.includes('highlight.js')) return 'hljs'
          if (id.includes('marked'))       return 'marked'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
