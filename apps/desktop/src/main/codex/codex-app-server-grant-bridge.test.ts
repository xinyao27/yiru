// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import { join } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { resolveCodexGrantEntryPath } from './codex-app-server-grant-bridge'

describe('resolveCodexGrantEntryPath', () => {
  const entryName = 'codex-app-server-grant-entry.js'

  it('finds the dev bundle from emitted main and chunk directories', () => {
    const mainDir = join('/opt', 'yiru', 'out', 'main')
    const expected = join(mainDir, 'codex', entryName)
    for (const moduleDir of [mainDir, join(mainDir, 'chunks')]) {
      expect(resolveCodexGrantEntryPath((candidate) => candidate === expected, moduleDir)).toBe(
        expected
      )
    }
  })

  it('resolves packaged bundles through app.asar.unpacked exactly once', () => {
    const resourcesDir = join('/Applications', 'Yiru.app', 'Contents', 'Resources')
    const expected = join(resourcesDir, 'app.asar.unpacked', 'out', 'main', 'codex', entryName)
    for (const archiveDir of ['app.asar', 'app.asar.unpacked']) {
      const moduleDir = join(resourcesDir, archiveDir, 'out', 'main', 'chunks')
      expect(resolveCodexGrantEntryPath((candidate) => candidate === expected, moduleDir)).toBe(
        expected
      )
    }
  })
})
