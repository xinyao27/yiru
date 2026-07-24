// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import type * as NodeOs from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { CodexManagedTrustGrantPlan } from './codex-hook-trust-grant'
import { computeTrustKey } from './config-toml-trust'

const { homedirMock, grantMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>(),
  grantMock: vi.fn()
}))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof NodeOs>('node:os')
  return { ...actual, homedir: homedirMock }
})

vi.mock('./codex-hook-trust-grant', () => ({
  CODEX_TRUST_GRANT_TRANSIENT_RETRY_INTERVAL_MS: 300_000,
  grantManagedCodexHookTrust: grantMock
}))

import { ensureRealHomeCodexHookState, _internals } from './codex-real-home-hook-install'
import { _internals as rebaseInternals } from './codex-user-hook-trust-rebase'
import { getCodexManagedHookInstallMaterial } from './hook-service'

let fakeHomeDir: string
let userDataDir: string
let previousUserDataPath: string | undefined

function getRealHooksJsonPath(): string {
  return join(fakeHomeDir, '.codex', 'hooks.json')
}

function readRealHooksJson(): {
  hooks?: Record<string, { hooks?: { command?: string }[] }[]>
  [key: string]: unknown
} {
  return JSON.parse(readFileSync(getRealHooksJsonPath(), 'utf-8'))
}

function grantSucceeds(): void {
  grantMock.mockImplementation((plan: CodexManagedTrustGrantPlan) => ({
    lane: 'rpc',
    entries: plan.managedEntries.map((entry) => ({ ...entry, trustedHash: 'codex-hash' }))
  }))
}

beforeEach(() => {
  grantMock.mockReset()
  fakeHomeDir = mkdtempSync(join(tmpdir(), 'yiru-real-home-hooks-home-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'yiru-real-home-hooks-user-data-'))
  previousUserDataPath = process.env.YIRU_USER_DATA_PATH
  process.env.YIRU_USER_DATA_PATH = userDataDir
  homedirMock.mockReturnValue(fakeHomeDir)
  mkdirSync(join(fakeHomeDir, '.codex'), { recursive: true })
  _internals.setLaneForTesting('pending')
})

afterEach(() => {
  rebaseInternals.setSessionRunnerSync(null)
  rebaseInternals.resetRetryState()
  rmSync(fakeHomeDir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
  if (previousUserDataPath === undefined) {
    delete process.env.YIRU_USER_DATA_PATH
  } else {
    process.env.YIRU_USER_DATA_PATH = previousUserDataPath
  }
  vi.clearAllMocks()
})

describe('ensureRealHomeCodexHookState (install)', () => {
  it('creates hooks.json with the Yiru entry in every managed event for a fresh home', () => {
    grantSucceeds()

    const lane = ensureRealHomeCodexHookState({ hooksEnabled: true, userDataPath: userDataDir })

    expect(lane).toBe('installed')
    const material = getCodexManagedHookInstallMaterial()
    const config = readRealHooksJson()
    for (const eventName of material.events) {
      const definitions = config.hooks?.[eventName]
      expect(definitions).toHaveLength(1)
      expect(definitions?.[0]?.hooks?.[0]?.command).toBe(material.command)
    }
    // The grant plan targeted the real home with append-position trust keys.
    const plan = grantMock.mock.calls[0]![0] as CodexManagedTrustGrantPlan
    expect(plan.runtimeHomePath).toBe(join(fakeHomeDir, '.codex'))
    expect(plan.host).toEqual({ kind: 'native' })
    expect(plan.useDefaultCodexHome).toBe(true)
    expect(plan.managedEntries.every((entry) => entry.groupIndex === 0)).toBe(true)
  })

  it('keeps a symlinked default home logical in the keys sent to Codex', () => {
    grantSucceeds()
    const logicalHome = join(fakeHomeDir, '.codex')
    const targetHome = join(fakeHomeDir, 'dotfiles-codex')
    rmSync(logicalHome, { recursive: true })
    mkdirSync(targetHome)
    symlinkSync(targetHome, logicalHome, process.platform === 'win32' ? 'junction' : 'dir')

    expect(ensureRealHomeCodexHookState({ hooksEnabled: true, userDataPath: userDataDir })).toBe(
      'installed'
    )

    const plan = grantMock.mock.calls[0]![0] as CodexManagedTrustGrantPlan
    expect(
      plan.managedEntries.map(computeTrustKey).every((key) => key.startsWith(logicalHome))
    ).toBe(true)
  })

  it('keeps the managed lane for unknown top-level fields Codex cannot load', () => {
    grantSucceeds()
    const userConfig = {
      hooks: {
        Stop: [{ matcher: 'deploy-*', hooks: [{ type: 'command', command: 'my-stop-hook.sh' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'my-compact-hook.sh' }] }]
      },
      _pluginManagerMetadata: { owner: 'someone-else' }
    }
    const original = `${JSON.stringify(userConfig, null, 2)}\n`
    writeFileSync(getRealHooksJsonPath(), original, 'utf-8')

    const lane = ensureRealHomeCodexHookState({ hooksEnabled: true, userDataPath: userDataDir })

    expect(lane).toBe('unavailable')
    expect(readFileSync(getRealHooksJsonPath(), 'utf-8')).toBe(original)
    expect(grantMock).not.toHaveBeenCalled()
    expect(existsSync(join(userDataDir, 'codex-real-home-hooks', 'hooks.json.pre-yiru'))).toBe(
      false
    )
  })

  it('appends LAST and preserves user entries and trust positions', () => {
    grantSucceeds()
    const userConfig = {
      hooks: {
        Stop: [{ matcher: 'deploy-*', hooks: [{ type: 'command', command: 'my-stop-hook.sh' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'my-compact-hook.sh' }] }]
      }
    }
    const original = `${JSON.stringify(userConfig, null, 2)}\n`
    writeFileSync(getRealHooksJsonPath(), original, 'utf-8')

    expect(ensureRealHomeCodexHookState({ hooksEnabled: true, userDataPath: userDataDir })).toBe(
      'installed'
    )

    const config = readRealHooksJson()
    expect(config.hooks?.Stop).toHaveLength(2)
    expect(config.hooks?.Stop?.[0]).toEqual(userConfig.hooks.Stop[0])
    expect(config.hooks?.PreCompact).toEqual(userConfig.hooks.PreCompact)
    const plan = grantMock.mock.calls[0]![0] as CodexManagedTrustGrantPlan
    expect(plan.managedEntries.find((entry) => entry.eventLabel === 'stop')?.groupIndex).toBe(1)
    expect(
      readFileSync(join(userDataDir, 'codex-real-home-hooks', 'hooks.json.pre-yiru'), 'utf-8')
    ).toBe(original)
  })

  // Why: ordinary Windows CI tokens cannot create file symlinks without Developer Mode.
  it.skipIf(process.platform === 'win32')(
    'updates a symlinked hooks.json target without replacing the symlink',
    () => {
      grantSucceeds()
      const dotfilesDir = join(fakeHomeDir, 'dotfiles')
      const targetPath = join(dotfilesDir, 'hooks.json')
      mkdirSync(dotfilesDir, { recursive: true })
      writeFileSync(
        targetPath,
        `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.sh' }] }] } }, null, 2)}\n`,
        'utf-8'
      )
      symlinkSync(targetPath, getRealHooksJsonPath())

      expect(ensureRealHomeCodexHookState({ hooksEnabled: true, userDataPath: userDataDir })).toBe(
        'installed'
      )

      expect(lstatSync(getRealHooksJsonPath()).isSymbolicLink()).toBe(true)
      expect(JSON.parse(readFileSync(targetPath, 'utf-8')).hooks.Stop).toHaveLength(2)
    }
  )
})
