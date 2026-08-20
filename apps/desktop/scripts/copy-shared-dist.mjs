import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const appRoot = join(import.meta.dirname, '..')
const sharedDist = join(appRoot, '..', '..', 'packages', 'shared', 'dist')
const sharedOutput = join(appRoot, 'out', 'shared')

function listCommonJsFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (directory === sharedDist && entry.name === 'esm') {
      continue
    }
    const target = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listCommonJsFiles(target))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(target)
    }
  }
  return files
}

// Why: CLI is a tsc emit, not a bundle. Alias rewriting points `~shared/x` at
// out/shared, and copying package CJS keeps the packaged asar self-contained.
rmSync(sharedOutput, { recursive: true, force: true })
for (const source of listCommonJsFiles(sharedDist)) {
  const destination = join(sharedOutput, relative(sharedDist, source))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}
