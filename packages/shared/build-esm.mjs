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
      input: Object.fromEntries(listTypeScriptEntries(sourceRoot)),
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs'
      }
    }
  }
})
