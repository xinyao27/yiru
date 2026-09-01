// Why: every declared protocol subpath needs matching ESM output for packaged daemon releases.
import { readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import { build } from 'vite'

const sourceRoot = resolve(import.meta.dirname, 'src')

function listTypeScriptEntries(directory) {
  const entries = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      entries.push(...listTypeScriptEntries(target))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const name = relative(sourceRoot, target).slice(0, -'.ts'.length).split(sep).join('/')
      entries.push([name, target])
    }
  }
  return entries
}

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
        ...Object.fromEntries(listTypeScriptEntries(resolve(sourceRoot, 'terminal-identity'))),
        ...Object.fromEntries(listTypeScriptEntries(resolve(sourceRoot, 'workbench'))),
        'ai-vault': resolve(import.meta.dirname, 'src/ai-vault.ts'),
        'protocol-version': resolve(import.meta.dirname, 'src/protocol-version.ts'),
        'runtime-capability-contract': resolve(
          import.meta.dirname,
          'src/runtime-capability-contract.ts'
        ),
        'runtime-compatibility': resolve(import.meta.dirname, 'src/runtime-compatibility.ts'),
        clipboard: resolve(import.meta.dirname, 'src/clipboard.ts'),
        contract: resolve(import.meta.dirname, 'src/contract/router.ts'),
        'model/agent': resolve(import.meta.dirname, 'src/model/agent.ts'),
        'model/loader': resolve(import.meta.dirname, 'src/model/loader.ts'),
        'model/loader-geometry': resolve(import.meta.dirname, 'src/model/loader-geometry.ts'),
        'model/platform': resolve(import.meta.dirname, 'src/model/platform.ts'),
        'model/product': resolve(import.meta.dirname, 'src/model/product.ts'),
        'model/review': resolve(import.meta.dirname, 'src/model/review.ts'),
        'model/ui': resolve(import.meta.dirname, 'src/model/ui.ts'),
        'model/workspace': resolve(import.meta.dirname, 'src/model/workspace.ts'),
        'mobile/e2ee-contract': resolve(
          import.meta.dirname,
          'src/mobile-transport/mobile-e2ee-v2-contract.ts'
        ),
        'mobile/e2ee-framing': resolve(
          import.meta.dirname,
          'src/mobile-transport/mobile-e2ee-v2-framing.ts'
        ),
        'mobile/outbound-backpressure': resolve(
          import.meta.dirname,
          'src/mobile-transport/ws-outbound-backpressure-queue.ts'
        ),
        'mobile/pairing-offer': resolve(
          import.meta.dirname,
          'src/mobile-transport/mobile-pairing-offer.ts'
        ),
        'mobile-development-pairing': resolve(
          import.meta.dirname,
          'src/mobile-development-pairing.ts'
        ),
        'mobile-accounts-wire': resolve(import.meta.dirname, 'src/mobile-wire/accounts-wire.ts'),
        'mobile-agent-history-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/agent-history-wire.ts'
        ),
        'mobile-agent-status-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/agent-status-wire.ts'
        ),
        'mobile-client-events-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/client-events-wire.ts'
        ),
        'mobile-hosted-review-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/hosted-review-wire.ts'
        ),
        'mobile-github-review-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/github-review-wire.ts'
        ),
        'mobile-files-wire': resolve(import.meta.dirname, 'src/mobile-wire/files-wire.ts'),
        'mobile-clipboard-wire': resolve(import.meta.dirname, 'src/mobile-wire/clipboard-wire.ts'),
        'mobile-notifications-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/notifications-wire.ts'
        ),
        'mobile-review-wire': resolve(import.meta.dirname, 'src/mobile-wire/review-wire.ts'),
        'mobile-runtime-types': resolve(import.meta.dirname, 'src/mobile-runtime-types.ts'),
        'mobile-browser-wire': resolve(import.meta.dirname, 'src/mobile-wire/browser-wire.ts'),
        'mobile-session-content-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/session-content-wire.ts'
        ),
        'mobile-session-tabs-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/session-tabs-wire.ts'
        ),
        'mobile-source-control-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/source-control-wire.ts'
        ),
        'mobile-stats-wire': resolve(import.meta.dirname, 'src/mobile-wire/stats-wire.ts'),
        'mobile-terminal-wire': resolve(import.meta.dirname, 'src/mobile-wire/terminal-wire.ts'),
        'mobile-terminal-quick-commands-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/terminal-quick-commands-wire.ts'
        ),
        'mobile-worktree-wire': resolve(import.meta.dirname, 'src/mobile-wire/worktree-wire.ts'),
        'mobile-workspace-creation-wire': resolve(
          import.meta.dirname,
          'src/mobile-wire/workspace-creation-wire.ts'
        ),
        'orpc-peer-frame': resolve(import.meta.dirname, 'src/runtime-orpc-peer-frame.ts'),
        'provider-usage': resolve(import.meta.dirname, 'src/provider-usage.ts'),
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
        'terminal-multiplex/recovery': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/recovery.ts'
        ),
        'terminal-multiplex/side-effects': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/side-effects.ts'
        ),
        'terminal-multiplex/snapshot-records': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/snapshot-records.ts'
        ),
        'terminal-multiplex/stream-records': resolve(
          import.meta.dirname,
          'src/terminal-multiplex/stream-records.ts'
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
      // CommonJS CLI and daemon consumers, so this one entry owns a bundled
      // compatibility artifact instead of emitting an unloadable require().
      external: [/^@yiru\//]
    }
  }
})
