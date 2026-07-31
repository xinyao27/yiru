import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

import { appendBuildOldSpaceOption } from './node-old-space-limit.mjs'

const require = createRequire(import.meta.url)
const vitePlusPackageJson = require.resolve('vite-plus/package.json')
// Why: Vite+ supplies the aliased Vite core without the legacy bin/vite.js;
// invoking its JS entry also works without a platform-specific .cmd shim.
const vitePlusCli = path.join(path.dirname(vitePlusPackageJson), 'bin', 'vp')

// Why: Raspberry Pi and release runners can hit Node's default old-space
// ceiling, but smaller hosts still need memory left for the OS and bundler.
const nodeOptions = appendBuildOldSpaceOption(process.env.NODE_OPTIONS)

const child = spawn(
  process.execPath,
  [vitePlusCli, 'build', '--config', 'vite.web.config.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions
    }
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
