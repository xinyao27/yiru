import { resolve } from 'node:path'

import { build } from 'vite'

const appRoot = resolve(import.meta.dirname, '..')

await build({
  configFile: false,
  build: {
    outDir: resolve(appRoot, 'out/cli/runtime'),
    emptyOutDir: false,
    lib: {
      entry: resolve(appRoot, 'src/cli/runtime/orpc-client-bundle.mts'),
      formats: ['cjs'],
      fileName: () => 'orpc-client-bundle.cjs'
    },
    rollupOptions: {
      // Why: @orpc/client is ESM-only, while the installed CLI is CommonJS. Bundle
      // that dependency here; keep Node built-ins external to preserve native loading.
      external: [/^node:/]
    }
  }
})
