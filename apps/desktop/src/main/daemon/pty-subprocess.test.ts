import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node-pty', () => ({ spawn: spawnMock }))

import { createPtySubprocess } from './pty-subprocess'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
const originalHome = process.env.HOME
const testDirectories: string[] = []

function mockPtyProcess() {
  return {
    pid: 321,
    process: 'bash',
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn()
  }
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
  const home = mkdtempSync(join(tmpdir(), 'yiru-daemon-cwd-'))
  testDirectories.push(home)
  process.env.HOME = home
  spawnMock.mockReset()
  spawnMock.mockReturnValue(mockPtyProcess())
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

describe('createPtySubprocess agent cwd safety', () => {
  it('resolves a safe default before validating omitted agent cwd', () => {
    const expectedCwd = process.env.HOME

    expect(() =>
      createPtySubprocess({
        sessionId: 'test',
        cols: 80,
        rows: 24,
        command: 'opencode'
      })
    ).not.toThrow()
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: expectedCwd })
    )
  })

  it('still rejects an explicit root-like agent cwd before spawning', () => {
    expect(() =>
      createPtySubprocess({
        sessionId: 'test',
        cols: 80,
        rows: 24,
        cwd: '/',
        command: 'opencode'
      })
    ).toThrow(/requires a non-root workspace/)
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
