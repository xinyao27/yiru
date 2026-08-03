#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const workspaceRoot = path.resolve(import.meta.dirname, '..')
const developmentDesktopCli = path.join(workspaceRoot, 'apps', 'desktop', 'scripts', 'yiru-dev.mjs')
const result = spawnSync('pnpm', ['-r', '--parallel', 'run', 'dev'], {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    YIRU_CLI: process.env.YIRU_CLI || developmentDesktopCli
  },
  shell: process.platform === 'win32',
  stdio: 'inherit'
})

if (result.signal) {
  process.kill(process.pid, result.signal)
}
process.exit(result.status ?? (result.error ? 1 : 0))
