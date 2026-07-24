// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import { sep } from 'node:path'

import { describe, expect, it } from 'vite-plus/test'

import { hasCustomCodexHomeOverride } from './codex-real-home-path'

describe('hasCustomCodexHomeOverride', () => {
  it('recognizes normalized aliases of Yiru-owned CODEX_HOME', () => {
    const managedHome = `${process.cwd()}${sep}codex-runtime-home${sep}home`

    expect(
      hasCustomCodexHomeOverride({
        CODEX_HOME: `${managedHome}${sep}.`,
        YIRU_CODEX_HOME: managedHome
      })
    ).toBe(false)
  })

  it('preserves a genuinely custom CODEX_HOME', () => {
    expect(
      hasCustomCodexHomeOverride({
        CODEX_HOME: `${process.cwd()}${sep}custom-codex-home`,
        YIRU_CODEX_HOME: `${process.cwd()}${sep}codex-runtime-home${sep}home`
      })
    ).toBe(true)
  })
})
