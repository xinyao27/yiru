import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  root: resolve('src/renderer'),
  // Why: pairing URLs may live under a reverse-proxy path prefix like
  // /yiru/web-index.html, so built assets must resolve relative to the page.
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    YIRU_FEATURE_WALL_ENABLED: 'true'
  },
  // Why: stated explicitly rather than leaning on the bundler reading tsconfig
  // paths, so the web build breaks loudly if an alias is added without it.
  resolve: {
    alias: {
      '~renderer': resolve('src/renderer'),
      '~shared': resolve('src/shared'),
      '~main': resolve('src/main'),
      '~preload': resolve('src/preload')
    }
  },
  build: {
    outDir: resolve('out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('src/renderer/web-index.html')
    }
  },
  worker: {
    format: 'es'
  }
})
