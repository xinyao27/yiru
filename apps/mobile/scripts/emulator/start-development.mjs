#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const hasDevelopmentDesktopCli = Boolean(process.env.YIRU_CLI)
const shouldAutoPair =
  process.platform === 'darwin' &&
  process.env.YIRU_MOBILE_AUTO_PAIR !== '0' &&
  hasDevelopmentDesktopCli
const scriptName = shouldAutoPair ? './start.mjs' : '../start-expo.mjs'
const scriptArgs = shouldAutoPair
  ? ['--pair-desktop', ...process.argv.slice(2)]
  : process.argv.slice(2)
const result = spawnSync(
  process.execPath,
  [path.resolve(import.meta.dirname, scriptName), ...scriptArgs],
  {
    env: process.env,
    stdio: 'inherit'
  }
)

if (result.signal) {
  process.kill(process.pid, result.signal)
}
process.exit(result.status ?? (result.error ? 1 : 0))
