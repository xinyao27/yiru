#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bundle the relay daemon and its crash-isolated watcher child per platform.
 *
 * The relay runs on remote hosts via `node relay.js`, so both outputs use
 * self-contained CommonJS bundles with no external dependencies beyond
 * Node.js built-ins. Native addons (node-pty, @parcel/watcher) are
 * marked external and expected to be installed on the remote or
 * gracefully degraded.
 */
import { rolldown } from 'rolldown'

const __dirname = import.meta.dirname
// Why: the script lives under config/scripts, so go two levels up to reach the repo root.
const ROOT = join(__dirname, '..', '..')
const RELAY_ENTRY = join(ROOT, 'src', 'relay', 'relay.ts')
const WATCHER_ENTRY = join(ROOT, 'src', 'main', 'ipc', 'parcel-watcher-process-entry.ts')

const PLATFORMS = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
  'win32-arm64'
]

const RELAY_VERSION = '0.1.0'

async function bundleNodeEntry(input, output, external = []) {
  const bundle = await rolldown({
    input,
    cwd: ROOT,
    external,
    platform: 'node',
    transform: {
      target: 'node18',
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    }
  })

  try {
    await bundle.write({
      file: output,
      format: 'cjs',
      minify: true,
      codeSplitting: false,
      sourcemap: false,
      comments: { legal: false }
    })
  } finally {
    await bundle.close()
  }
}

for (const platform of PLATFORMS) {
  const outDir = join(ROOT, 'out', 'relay', platform)
  mkdirSync(outDir, { recursive: true })

  await bundleNodeEntry(RELAY_ENTRY, join(outDir, 'relay.js'), [
    // Native addons cannot be bundled — they must exist on the remote host.
    // The relay gracefully degrades when they are absent.
    'node-pty',
    '@parcel/watcher',
    'electron'
  ])

  await bundleNodeEntry(WATCHER_ENTRY, join(outDir, 'relay-watcher.js'), ['@parcel/watcher'])

  // Why: include a content hash so the deploy check detects code changes
  // even when RELAY_VERSION hasn't been bumped. Hash both process artifacts
  // so a watcher-only change always deploys beside the matching relay host.
  const relayContent = readFileSync(join(outDir, 'relay.js'))
  const watcherContent = readFileSync(join(outDir, 'relay-watcher.js'))
  const hash = createHash('sha256')
    .update(relayContent)
    .update(watcherContent)
    .digest('hex')
    .slice(0, 12)
  writeFileSync(join(outDir, '.version'), `${RELAY_VERSION}+${hash}`)

  console.log(`Built relay for ${platform} → ${outDir}/relay.js`)
}

// WSL agent-hook relay: a hooks-only guest receiver launched inside WSL
// distros via wsl.exe. Pure Node built-ins (no node-pty/@parcel/watcher),
// so a single platform-independent bundle suffices; it ships inside the
// Windows app via the same out/relay extraResources mapping.
{
  const wslEntry = join(ROOT, 'src', 'relay', 'wsl-agent-hook-relay.ts')
  const outDir = join(ROOT, 'out', 'relay', 'wsl')
  mkdirSync(outDir, { recursive: true })
  await bundleNodeEntry(wslEntry, join(outDir, 'wsl-agent-hook-relay.js'))
  const content = readFileSync(join(outDir, 'wsl-agent-hook-relay.js'))
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12)
  writeFileSync(join(outDir, '.version'), `${RELAY_VERSION}+${hash}`)
  console.log(`Built WSL hook relay → ${outDir}/wsl-agent-hook-relay.js`)
}

console.log('Relay build complete.')
