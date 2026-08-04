#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bundle the WSL agent-hook relay: a hooks-only receiver that runs inside a WSL
 * distribution, launched via wsl.exe.
 *
 * The guest runs it as `node wsl-agent-hook-relay.js`, so the output is a
 * self-contained CommonJS bundle with no dependencies beyond Node built-ins.
 * Pure built-ins means no native addons and no per-platform variants — one
 * bundle serves every distro, and it ships inside the Windows app through the
 * `out/relay` extraResources mapping.
 */
import { rolldown } from 'rolldown'

const __dirname = import.meta.dirname
// Why: the script lives under apps/desktop/scripts, so go one level up to reach
// the app root.
const ROOT = join(__dirname, '..')
const WSL_ENTRY = join(ROOT, 'src', 'relay', 'wsl-agent-hooks', 'relay.ts')

const RELAY_VERSION = '0.1.0'

async function bundleNodeEntry(input, output, external = []) {
  const bundle = await rolldown({
    input,
    cwd: ROOT,
    external,
    platform: 'node',
    // Why: the relay imports shared/ through the repository alias, and rolldown
    // has no tsconfig paths reader.
    resolve: {
      alias: {
        '~shared': join(ROOT, 'src', 'shared')
      }
    },
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

const outDir = join(ROOT, 'out', 'relay', 'wsl')
mkdirSync(outDir, { recursive: true })
await bundleNodeEntry(WSL_ENTRY, join(outDir, 'wsl-agent-hook-relay.js'))

// Why: include a content hash so the install check detects code changes even
// when RELAY_VERSION hasn't been bumped.
const content = readFileSync(join(outDir, 'wsl-agent-hook-relay.js'))
const hash = createHash('sha256').update(content).digest('hex').slice(0, 12)
writeFileSync(join(outDir, '.version'), `${RELAY_VERSION}+${hash}`)
console.log(`Built WSL hook relay → ${outDir}/wsl-agent-hook-relay.js`)
