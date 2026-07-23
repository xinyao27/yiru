import { resolve } from 'node:path'

import { build } from 'vite'

await build({
  build: {
    outDir: 'dist/esm',
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        agent: resolve(import.meta.dirname, 'src/agent.ts'),
        platform: resolve(import.meta.dirname, 'src/platform.ts'),
        product: resolve(import.meta.dirname, 'src/product.ts'),
        review: resolve(import.meta.dirname, 'src/review.ts'),
        ui: resolve(import.meta.dirname, 'src/ui.ts'),
        workspace: resolve(import.meta.dirname, 'src/workspace.ts')
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      }
    }
  }
})
