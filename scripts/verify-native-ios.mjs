#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin') {
  console.log(`[native-ios] skipped on ${process.platform}; the macOS PR gate runs the full build`)
  process.exit(0)
}

const result = spawnSync('vp', ['run', 'yiru-mobile-ios#verify'], { stdio: 'inherit' })
if (result.signal) {
  process.kill(process.pid, result.signal)
}
process.exit(result.status ?? (result.error ? 1 : 0))
