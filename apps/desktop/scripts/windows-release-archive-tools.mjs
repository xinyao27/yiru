#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js'

const [command, inputPath, outputPath] = process.argv.slice(2)

if (!command || !inputPath || !outputPath) {
  fail('Usage: windows-release-archive-tools.mjs <blockmap|extract> <input-path> <output-path>')
}

const input = path.resolve(inputPath)
const output = path.resolve(outputPath)

if (command === 'blockmap') {
  // Why: electron-builder no longer installs app-builder-bin, so release
  // signing must use the same JS blockmap implementation as the packager.
  await buildBlockMap(input, 'gzip', output)
  console.log(`Built blockmap: ${output}`)
} else if (command === 'extract') {
  // Why: the 7-Zip tool is now an electron-builder-managed download rather
  // than a stable root node_modules path in pnpm workspaces.
  mkdirSync(output, { recursive: true })
  const sevenZip = await getPath7za()
  execFileSync(sevenZip, ['x', input, `-o${output}`, '-y'], { stdio: 'inherit' })
  console.log(`Extracted archive: ${output}`)
} else {
  fail(`Unknown command: ${command}`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
