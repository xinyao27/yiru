import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { killWithDescendantSweepMock, spawnMock } = vi.hoisted(() => ({
  killWithDescendantSweepMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn: spawnMock }))
vi.mock('../pty-descendant-termination', () => ({
  killWithDescendantSweep: killWithDescendantSweepMock
}))

import { LocalPtyProvider } from './local-pty-provider'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalHome = process.env.HOME
const testDirectories: string[] = []

function mockPtyProcess() {
  let exitListener: ((event: { exitCode: number; signal: number }) => void) | null = null
  return {
    pid: 4321,
    process: 'bash',
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn((listener) => {
      exitListener = listener
      return { dispose: vi.fn() }
    }),
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(() => exitListener?.({ exitCode: 0, signal: 0 }))
  }
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
  const home = mkdtempSync(join(tmpdir(), 'yiru-local-pty-'))
  testDirectories.push(home)
  process.env.HOME = home
  spawnMock.mockReset()
  spawnMock.mockReturnValue(mockPtyProcess())
  killWithDescendantSweepMock.mockReset()
  killWithDescendantSweepMock.mockImplementation(async (_pid, killRoot) => killRoot())
})

afterEach(() => {
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
  if (originalHome === undefined) {
    delete process.env.HOME
  } else {
    process.env.HOME = originalHome
  }
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('LocalPtyProvider descendant shutdown routing', () => {
  it('does not request a descendant sweep for a non-agent PTY', async () => {
    const provider = new LocalPtyProvider()
    const { id } = await provider.spawn({ cols: 80, rows: 24 })
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })

    await provider.shutdown(id, { immediate: true })

    expect(killWithDescendantSweepMock).not.toHaveBeenCalled()
  })

  it('routes agent PTY shutdown through the descendant sweep', async () => {
    const provider = new LocalPtyProvider()
    const { id } = await provider.spawn({ cols: 80, rows: 24, command: 'opencode' })

    await provider.shutdown(id, { immediate: true })

    expect(killWithDescendantSweepMock).toHaveBeenCalledWith(
      4321,
      expect.any(Function),
      expect.objectContaining({ ownsRoot: expect.any(Function) })
    )
  })
})
