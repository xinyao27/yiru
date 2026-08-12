#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const sourcePath = path.join(desktopRoot, 'native', 'machine-key-macos', 'main.swift')
const outputPath = path.join(
  desktopRoot,
  'native',
  'machine-key-macos',
  '.build',
  'release',
  'yiru-machine-key'
)

if (process.platform !== 'darwin') {
  process.exit(0)
}

const triples = process.argv.includes('--single-arch')
  ? [process.arch === 'arm64' ? 'arm64-apple-macosx' : 'x86_64-apple-macosx']
  : ['arm64-apple-macosx', 'x86_64-apple-macosx']
const workDirectory = path.join(tmpdir(), `yiru-machine-key-${process.pid}`)
mkdirSync(workDirectory, { recursive: true })
try {
  const binaries = triples.map((triple) => {
    const binary = path.join(workDirectory, triple)
    execFileSync(
      'swiftc',
      [
        '-O',
        sourcePath,
        '-target',
        triple.replace('-apple-macosx', '-apple-macosx11.0'),
        '-framework',
        'Security',
        '-o',
        binary
      ],
      { stdio: 'inherit' }
    )
    return binary
  })
  mkdirSync(path.dirname(outputPath), { recursive: true })
  if (binaries.length === 1) {
    execFileSync('cp', [binaries[0], outputPath])
  } else {
    execFileSync('lipo', ['-create', ...binaries, '-output', outputPath])
    execFileSync('lipo', [outputPath, '-verify_arch', 'arm64', 'x86_64'])
  }
  execFileSync('chmod', ['755', outputPath])
} finally {
  rmSync(workDirectory, { recursive: true, force: true })
}
