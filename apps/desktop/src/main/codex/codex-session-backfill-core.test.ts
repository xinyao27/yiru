// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import type * as NodeFs from 'node:fs'
import type * as NodeFsPromises from 'node:fs/promises'
import type * as NodeOs from 'node:os'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>()
}))

const { fsMockState } = vi.hoisted(() => ({
  fsMockState: {
    failLink: false,
    failInstallLink: false,
    failInstallLinkTransiently: false,
    raceTargetIntoExistence: false,
    failCopy: false,
    failAuditMkdirOnce: false,
    failAuditWrites: false,
    failDirectoryPath: null as string | null,
    failLstatPath: null as string | null
  }
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => {
      if (args[0] === fsMockState.failLstatPath) {
        return false
      }
      return actual.existsSync(...args)
    }
  }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof NodeFsPromises>('node:fs/promises')
  return {
    ...actual,
    mkdir: (...args: Parameters<typeof actual.mkdir>) => {
      if (fsMockState.failAuditMkdirOnce && String(args[0]).includes('codex-session-backfill')) {
        fsMockState.failAuditMkdirOnce = false
        const error = new Error(
          'EACCES: transient audit directory failure'
        ) as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return actual.mkdir(...args)
    },
    appendFile: (...args: Parameters<typeof actual.appendFile>) => {
      if (fsMockState.failAuditWrites && String(args[0]).includes('codex-session-backfill')) {
        const error = new Error('ENOSPC: audit write failed') as NodeJS.ErrnoException
        error.code = 'ENOSPC'
        throw error
      }
      return actual.appendFile(...args)
    },
    lstat: (...args: Parameters<typeof actual.lstat>) => {
      if (args[0] === fsMockState.failLstatPath) {
        const error = new Error('EACCES: path inaccessible') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return actual.lstat(...args)
    },
    link: async (...args: Parameters<typeof actual.link>) => {
      if (fsMockState.raceTargetIntoExistence && String(args[0]).includes('codex-runtime-home')) {
        fsMockState.raceTargetIntoExistence = false
        await actual.writeFile(args[1], 'concurrent target\n', 'utf-8')
        const error = new Error('EEXIST: concurrent target') as NodeJS.ErrnoException
        error.code = 'EEXIST'
        throw error
      }
      if (fsMockState.failLink && String(args[0]).includes('codex-runtime-home')) {
        const error = new Error('EXDEV: cross-device link') as NodeJS.ErrnoException
        error.code = 'EXDEV'
        throw error
      }
      // Simulate a target filesystem with no hardlink support: even the
      // same-volume staged-copy install link (.yiru-backfill-*.tmp) fails.
      if (fsMockState.failInstallLink && String(args[0]).includes('.yiru-backfill-')) {
        const error = new Error('EPERM: hardlinks unsupported') as NodeJS.ErrnoException
        error.code = 'EPERM'
        throw error
      }
      if (fsMockState.failInstallLinkTransiently && String(args[0]).includes('.yiru-backfill-')) {
        const error = new Error('EIO: transient install failure') as NodeJS.ErrnoException
        error.code = 'EIO'
        throw error
      }
      return actual.link(...args)
    },
    copyFile: async (...args: Parameters<typeof actual.copyFile>) => {
      if (fsMockState.failCopy) {
        // Simulate a copy that fails after opening its destination, which is
        // the dangerous case for resumability rather than a preflight error.
        await actual.writeFile(args[1], 'partial copy\n', 'utf-8')
        const error = new Error('EACCES: copy disabled for test') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return actual.copyFile(...args)
    },
    opendir: (...args: Parameters<typeof actual.opendir>) => {
      if (args[0] === fsMockState.failDirectoryPath) {
        const error = new Error('EACCES: directory unreadable') as NodeJS.ErrnoException
        error.code = 'EACCES'
        throw error
      }
      return actual.opendir(...args)
    }
  }
})

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof NodeOs>('node:os')
  return {
    ...actual,
    homedir: homedirMock
  }
})

import {
  backfillManagedCodexSessionsIntoSystemHome,
  resolveCodexSessionBackfillPaths
} from './codex-session-backfill'

let fakeHomeDir: string
let userDataDir: string
let previousUserDataPath: string | undefined

function getSystemSessionsRoot(): string {
  return join(fakeHomeDir, '.codex', 'sessions')
}

function getManagedSessionsRoot(): string {
  return join(userDataDir, 'codex-runtime-home', 'home', 'sessions')
}

function getAuditLogPath(): string {
  return join(userDataDir, 'codex-session-backfill', 'audit.jsonl')
}

function writeManagedSession(relativePath: string, contents: string): string {
  const filePath = join(getManagedSessionsRoot(), relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents, 'utf-8')
  return filePath
}

function readAuditActions(): string[] {
  return readFileSync(getAuditLogPath(), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [(JSON.parse(line) as { action: string }).action]
      } catch {
        return []
      }
    })
}

beforeEach(() => {
  fsMockState.failLink = false
  fsMockState.failInstallLink = false
  fsMockState.failInstallLinkTransiently = false
  fsMockState.raceTargetIntoExistence = false
  fsMockState.failCopy = false
  fsMockState.failAuditMkdirOnce = false
  fsMockState.failAuditWrites = false
  fsMockState.failDirectoryPath = null
  fsMockState.failLstatPath = null
  fakeHomeDir = mkdtempSync(join(tmpdir(), 'yiru-codex-backfill-home-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'yiru-codex-backfill-user-data-'))
  previousUserDataPath = process.env.YIRU_USER_DATA_PATH
  process.env.YIRU_USER_DATA_PATH = userDataDir
  homedirMock.mockReturnValue(fakeHomeDir)
})

afterEach(() => {
  rmSync(fakeHomeDir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
  if (previousUserDataPath === undefined) {
    delete process.env.YIRU_USER_DATA_PATH
  } else {
    process.env.YIRU_USER_DATA_PATH = previousUserDataPath
  }
  vi.clearAllMocks()
})

describe('backfillManagedCodexSessionsIntoSystemHome', () => {
  it('hardlinks managed rollout files into the real home preserving layout', async () => {
    const managedPath = writeManagedSession(
      join('2026', '05', '26', 'rollout-a.jsonl'),
      '{"type":"session_meta","id":"a"}\n'
    )
    writeManagedSession(join('2026', '06', '01', 'rollout-b.jsonl'), '{"id":"b"}\n')
    writeFileSync(join(getManagedSessionsRoot(), '2026', '05', '26', 'notes.txt'), 'skip me\n')

    const summary = await backfillManagedCodexSessionsIntoSystemHome(
      resolveCodexSessionBackfillPaths()
    )

    expect(summary).toMatchObject({ scannedFiles: 2, linkedFiles: 2, failedFiles: 0 })
    const targetPath = join(getSystemSessionsRoot(), '2026', '05', '26', 'rollout-a.jsonl')
    expect(lstatSync(targetPath).ino).toBe(lstatSync(managedPath).ino)
    expect(existsSync(join(getSystemSessionsRoot(), '2026', '06', '01', 'rollout-b.jsonl'))).toBe(
      true
    )
    expect(existsSync(join(getSystemSessionsRoot(), '2026', '05', '26', 'notes.txt'))).toBe(false)
    expect(readAuditActions()).toEqual(['hardlink', 'hardlink', 'run-summary'])
  })

  it('only backfills rollout files in the exact YYYY/MM/DD layout', async () => {
    writeManagedSession(join('2026', '05', '26', 'rollout-valid ü.jsonl'), 'valid\n')
    writeManagedSession(join('2026', '05', '26', 'session-index.jsonl'), 'not a rollout\n')
    writeManagedSession(join('2026', '5', '26', 'rollout-wrong-month.jsonl'), 'wrong month\n')
    writeManagedSession(join('scratch', 'rollout-too-shallow.jsonl'), 'too shallow\n')
    writeManagedSession(join('2026', '05', '26', 'nested', 'rollout-too-deep.jsonl'), 'too deep\n')

    const summary = await backfillManagedCodexSessionsIntoSystemHome(
      resolveCodexSessionBackfillPaths()
    )

    expect(summary).toMatchObject({
      scannedFiles: 5,
      linkedFiles: 1,
      skippedUnexpectedFiles: 4,
      failedFiles: 0
    })
    expect(
      existsSync(join(getSystemSessionsRoot(), '2026', '05', '26', 'rollout-valid ü.jsonl'))
    ).toBe(true)
    expect(
      existsSync(join(getSystemSessionsRoot(), '2026', '05', '26', 'session-index.jsonl'))
    ).toBe(false)
    expect(existsSync(join(getSystemSessionsRoot(), 'scratch'))).toBe(false)
  })

  it('never overwrites an existing target file, even with different contents', async () => {
    writeManagedSession(join('2026', '05', '26', 'rollout-a.jsonl'), 'managed contents\n')
    const collidingPath = join(getSystemSessionsRoot(), '2026', '05', '26', 'rollout-a.jsonl')
    mkdirSync(dirname(collidingPath), { recursive: true })
    writeFileSync(collidingPath, 'user contents\n', 'utf-8')

    const summary = await backfillManagedCodexSessionsIntoSystemHome(
      resolveCodexSessionBackfillPaths()
    )

    expect(summary).toMatchObject({ scannedFiles: 1, linkedFiles: 0, skippedExistingFiles: 1 })
    expect(readFileSync(collidingPath, 'utf-8')).toBe('user contents\n')
    expect(readAuditActions()).toEqual(['existing', 'run-summary'])
  })
})
