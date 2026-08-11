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
      external: [/^@orpc\//, /^@yiru\//, 'zod'],
      input: {
        'ai-vault': resolve(import.meta.dirname, 'src/ai-vault.ts'),
        capabilities: resolve(import.meta.dirname, 'src/capabilities.ts'),
        clipboard: resolve(import.meta.dirname, 'src/clipboard.ts'),
        'client-invalidations': resolve(import.meta.dirname, 'src/runtime-client-invalidations.ts'),
        contract: resolve(import.meta.dirname, 'src/contract/router.ts'),
        'mobile-development-pairing': resolve(
          import.meta.dirname,
          'src/mobile-development-pairing.ts'
        ),
        'mobile-runtime-types': resolve(import.meta.dirname, 'src/mobile-runtime-types.ts'),
        'orpc-peer-frame': resolve(import.meta.dirname, 'src/runtime-orpc-peer-frame.ts'),
        'rpc-envelope': resolve(import.meta.dirname, 'src/runtime-rpc-envelope.ts'),
        stats: resolve(import.meta.dirname, 'src/stats.ts'),
        'stats-usage-range': resolve(import.meta.dirname, 'src/stats-usage-range.ts'),
        status: resolve(import.meta.dirname, 'src/status.ts'),
        'subscription-replay': resolve(import.meta.dirname, 'src/runtime-subscription-replay.ts'),
        'tailscale-endpoint': resolve(import.meta.dirname, 'src/remote-runtime-tailscale-hint.ts'),
        'terminal-osc-links': resolve(import.meta.dirname, 'src/terminal-osc-link-ranges.ts'),
        'terminal-multiplex/connection-records': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/connection-records.ts'
        ),
        'terminal-multiplex/crc32c': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/crc32c.ts'
        ),
        'terminal-multiplex/error-codes': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/error-codes.ts'
        ),
        'terminal-multiplex/flow-records': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/flow-records.ts'
        ),
        'terminal-multiplex/frame': resolve(import.meta.dirname, 'src/terminal-multiplex/frame.ts'),
        'terminal-multiplex/json': resolve(import.meta.dirname, 'src/terminal-multiplex/json.ts'),
        'terminal-multiplex/snapshot-records': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/snapshot-records.ts'
        ),
        'terminal-query-reply': resolve(import.meta.dirname, 'src/terminal-query-reply.ts'),
        updater: resolve(import.meta.dirname, 'src/updater.ts')
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      }
    }
  }
})

await build({
  build: {
    outDir: 'dist/cjs',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/contract/router.ts'),
      formats: ['cjs'],
      fileName: () => 'contract.cjs'
    },
    rollupOptions: {
      // Why: oRPC is ESM-only. The runtime-protocol package still supports
      // CommonJS CLI and Electron consumers, so this one entry owns a bundled
      // compatibility artifact instead of emitting an unloadable require().
      external: [/^@yiru\//]
    }
  }
})
