import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createPackage } from '@electron/asar'
import { describe, expect, it } from 'vite-plus/test'

const execFileAsync = promisify(execFile)
const verifierPath = fileURLToPath(new URL('./verify-telemetry-constants.mjs', import.meta.url))

describe('verify-telemetry-constants', () => {
  it('accepts Rolldown var declarations in the packaged main bundle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'yiru-telemetry-constants-'))
    const payloadDir = join(root, 'payload')
    const distDir = join(root, 'dist')

    try {
      await mkdir(join(payloadDir, 'out', 'main'), { recursive: true })
      await mkdir(distDir, { recursive: true })
      await writeFile(
        join(payloadDir, 'out', 'main', 'index.js'),
        ['var BUILD_IDENTITY = "stable";', 'var WRITE_KEY = "phc_fixture_write_key";'].join('\n')
      )
      await createPackage(payloadDir, join(distDir, 'app.asar'))

      const { stdout } = await execFileAsync(process.execPath, [verifierPath, distDir])

      expect(stdout).toContain(
        'Telemetry constants verified across 1 asar(s): BUILD_IDENTITY="stable"'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
