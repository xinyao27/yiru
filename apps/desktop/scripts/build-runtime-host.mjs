#!/usr/bin/env node
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { rolldown } from 'rolldown'

const APP_ROOT = join(import.meta.dirname, '..')
const OUTPUT_DIRECTORY = join(APP_ROOT, 'out', 'runtime-host')
const HOST_ENTRY = join(APP_ROOT, 'src', 'main', 'runtime', 'host', 'entry.ts')
const HOST_OUTPUT = join(OUTPUT_DIRECTORY, 'yiru-runtime-host.cjs')
const WARP_THEME_WORKER_ENTRY = join(
  APP_ROOT,
  'src',
  'main',
  'warp-themes',
  'warp-theme-parser-worker.ts'
)
const WARP_THEME_WORKER_OUTPUT = join(OUTPUT_DIRECTORY, 'warp-theme-parser-worker.cjs')
const APP_VERSION = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).version

function hasRuntimeElectronImport(source) {
  const electronReference = /(?:from\s+|import\s*\(|require\s*\()\s*['"]electron(?:\/[^'"]*)?['"]/g
  for (const match of source.matchAll(electronReference)) {
    const precedingSource = source.slice(0, match.index)
    const importStart = Math.max(
      precedingSource.lastIndexOf('\nimport '),
      precedingSource.lastIndexOf('\nexport '),
      precedingSource.startsWith('import ') || precedingSource.startsWith('export ') ? 0 : -1
    )
    const statementPrefix = source.slice(Math.max(0, importStart), match.index)
    if (/^\s*(?:import|export)\s+type\b/.test(statementPrefix)) {
      continue
    }
    return true
  }
  return false
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

async function bundleRuntimeEntry(input, output, external = []) {
  const bundle = await rolldown({
    input,
    cwd: APP_ROOT,
    external,
    plugins: [
      {
        name: 'runtime-host-electron-boundary',
        transform(source, id) {
          // Why: Rolldown can discard an unused static import before resolveId,
          // so source inspection is required for the guard's negative probe.
          if (hasRuntimeElectronImport(source)) {
            throw new Error(`Pure Node runtime host reached Electron from ${id}`)
          }
          return null
        },
        resolveId(source, importer) {
          if (source === 'electron' || source.startsWith('electron/')) {
            throw new Error(`Pure Node runtime host reached Electron from ${importer ?? 'unknown'}`)
          }
          return null
        }
      }
    ],
    platform: 'node',
    resolve: {
      alias: {
        'jsonc-parser': join(APP_ROOT, 'node_modules', 'jsonc-parser', 'lib', 'esm', 'main.js'),
        '~main': join(APP_ROOT, 'src', 'main'),
        '~shared': join(APP_ROOT, '..', '..', 'packages', 'shared', 'src')
      }
    },
    transform: {
      target: 'node18',
      define: {
        'process.env.NODE_ENV': '"production"',
        'process.env.YIRU_APP_VERSION': JSON.stringify(APP_VERSION),
        YIRU_BUILD_IDENTITY: 'null',
        YIRU_POSTHOG_WRITE_KEY: 'null'
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

// Why: node-pty selects and loads its target-architecture native addon at
// runtime. Packaged builds already copy its exact closure to Resources/node_modules;
// bundling its loader would sever those paths.
await bundleRuntimeEntry(HOST_ENTRY, HOST_OUTPUT, ['node-pty'])
await bundleRuntimeEntry(WARP_THEME_WORKER_ENTRY, WARP_THEME_WORKER_OUTPUT)

console.log(`Built Node runtime host → ${HOST_OUTPUT}`)
