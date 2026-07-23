import { resolve } from 'node:path'

import { build } from 'vite'

await build({
  build: {
    outDir: 'dist/esm',
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      // Why: runtime contracts stay independently versioned from their model
      // and schema dependencies instead of bundling duplicate library copies.
      external: [/^@yiru\//, 'zod'],
      input: {
        capabilities: resolve(import.meta.dirname, 'src/capabilities.ts'),
        'client-invalidations': resolve(import.meta.dirname, 'src/runtime-client-invalidations.ts'),
        'mobile-runtime-types': resolve(import.meta.dirname, 'src/mobile-runtime-types.ts'),
        'rpc-envelope': resolve(import.meta.dirname, 'src/runtime-rpc-envelope.ts'),
        'ssh-connection': resolve(import.meta.dirname, 'src/ssh-types.ts'),
        'subscription-replay': resolve(import.meta.dirname, 'src/runtime-subscription-replay.ts'),
        'tailscale-endpoint': resolve(import.meta.dirname, 'src/remote-runtime-tailscale-hint.ts'),
        'terminal-osc-links': resolve(import.meta.dirname, 'src/terminal-osc-link-ranges.ts'),
        'terminal-query-reply': resolve(import.meta.dirname, 'src/terminal-query-reply.ts')
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      }
    }
  }
})
