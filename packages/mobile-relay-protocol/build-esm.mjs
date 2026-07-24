import { resolve } from 'node:path'

import { build } from 'vite'

await build({
  build: {
    outDir: 'dist/esm',
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      // Why: callers must share their installed crypto/schema dependencies;
      // protocol entry points should not embed private copies of either one.
      external: ['tweetnacl', 'zod'],
      input: {
        'credential-contract': resolve(
          import.meta.dirname,
          'src/mobile-relay-credential-contract.ts'
        ),
        'e2ee-contract': resolve(import.meta.dirname, 'src/mobile-e2ee-v2-contract.ts'),
        'e2ee-framing': resolve(import.meta.dirname, 'src/mobile-e2ee-v2-framing.ts'),
        'outbound-backpressure': resolve(
          import.meta.dirname,
          'src/ws-outbound-backpressure-queue.ts'
        ),
        'pairing-offer': resolve(import.meta.dirname, 'src/mobile-relay-pairing-offer.ts'),
        'phone-protocol': resolve(import.meta.dirname, 'src/mobile-relay-phone-protocol.ts')
      },
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      }
    }
  }
})
