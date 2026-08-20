import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClientVitePreset } from '@yiru/client/vite'
import { defineConfig } from 'vite-plus'

const clientVitePreset = createClientVitePreset({ featureWallEnabled: true })

export default defineConfig({
  ...clientVitePreset,
  // Why: pairing URLs may live under a reverse-proxy path prefix like
  // /yiru/web-index.html, so built assets must resolve relative to the page.
  base: './',
  build: {
    outDir: resolve('out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(import.meta.resolve('@yiru/client/web-index.html'))
    }
  }
})
