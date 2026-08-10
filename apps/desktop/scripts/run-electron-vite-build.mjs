import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

import { appendBuildOldSpaceOption } from './node-old-space-limit.mjs'

const require = createRequire(import.meta.url)
const appRoot = path.join(import.meta.dirname, '..')
const electronVitePackageJson = require.resolve('electron-vite/package.json')
const electronViteCli = path.join(path.dirname(electronVitePackageJson), 'bin', 'electron-vite.js')

// Release builds have started OOMing on GitHub's macOS runners during the
// renderer bundle. Reserve memory on smaller hosts so the OS does not kill Vite.
const nodeOptions = appendBuildOldSpaceOption(process.env.NODE_OPTIONS)

const child = spawn(process.execPath, [electronViteCli, 'build', ...process.argv.slice(2)], {
  // Why: electron.vite.config.ts resolves source entries relative to cwd, while
  // this wrapper is also a documented repository-root verification entry.
  cwd: appRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
