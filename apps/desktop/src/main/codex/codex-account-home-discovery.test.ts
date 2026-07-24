import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { getCodexSessionDirectories } from '../codex-usage/scanner'
import { getCodexAccountHomeSessionDirectories } from './codex-account-home-discovery'

describe('getCodexAccountHomeSessionDirectories', () => {
  let rootDir: string
  let previousUserDataPath: string | undefined

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'yiru-codex-account-discovery-'))
    previousUserDataPath = process.env.YIRU_USER_DATA_PATH
    process.env.YIRU_USER_DATA_PATH = rootDir
  })

  afterEach(() => {
    if (previousUserDataPath === undefined) {
      delete process.env.YIRU_USER_DATA_PATH
    } else {
      process.env.YIRU_USER_DATA_PATH = previousUserDataPath
    }
    rmSync(rootDir, { recursive: true, force: true })
  })

  function createAccountSessions(accountId: string): string {
    const homePath = join(rootDir, 'codex-accounts', accountId, 'home')
    const sessionsPath = join(homePath, 'sessions')
    mkdirSync(sessionsPath, { recursive: true })
    writeFileSync(join(homePath, '.yiru-managed-home'), `${accountId}\n`, 'utf-8')
    return sessionsPath
  }

  it('discovers every marked host account home without duplicates', () => {
    const first = createAccountSessions('account-1')
    const second = createAccountSessions('account-2')

    expect(getCodexAccountHomeSessionDirectories().sort()).toEqual([first, second].sort())
    const allSessionRoots = getCodexSessionDirectories()
    expect(allSessionRoots).toEqual(expect.arrayContaining([first, second]))
    expect(new Set(allSessionRoots).size).toBe(allSessionRoots.length)
  })

  it('skips unowned homes and non-directory session entries', () => {
    const unownedSessions = join(rootDir, 'codex-accounts', 'unowned', 'home', 'sessions')
    mkdirSync(unownedSessions, { recursive: true })

    const ownedHome = join(rootDir, 'codex-accounts', 'redirected', 'home')
    mkdirSync(ownedHome, { recursive: true })
    writeFileSync(join(ownedHome, '.yiru-managed-home'), 'redirected\n', 'utf-8')
    writeFileSync(join(ownedHome, 'sessions'), 'not a directory\n', 'utf-8')

    expect(getCodexAccountHomeSessionDirectories()).toEqual([])
  })
})
