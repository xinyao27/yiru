import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src')
    }
  },
  server: {
    // Why: electron-vite claims 5173 during root `pnpm dev`, and the whole
    // 517x-53xx band is churned by strictPort benchmark preview servers.
    port: 4180
  }
})
