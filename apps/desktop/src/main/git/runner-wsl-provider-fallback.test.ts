import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { execFileMock, getDefaultWslDistroMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getDefaultWslDistroMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: vi.fn(),
  spawn: spawnMock
}))

vi.mock('../wsl', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDefaultWslDistro: getDefaultWslDistroMock
}))

import { ghExecFileAsync, glabExecFileAsync, setDefaultWslDistroOverride } from './runner'

const originalPlatform = process.platform

function childProcessStub(): EventEmitter & { stdin: null } {
  return Object.assign(new EventEmitter(), { stdin: null })
}

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
  getDefaultWslDistroMock.mockReset()
  getDefaultWslDistroMock.mockReturnValue(null)
  setDefaultWslDistroOverride(null)
  Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
})

afterEach(() => {
  setDefaultWslDistroOverride(null)
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
})

describe('global provider CLI WSL fallback', () => {
  it('routes a missing host gh through the user-pinned distro', async () => {
    setDefaultWslDistroOverride('Debian')
    getDefaultWslDistroMock.mockReturnValue('Ubuntu')
    execFileMock
      .mockImplementationOnce((_binary, _args, _options, callback) => {
        queueMicrotask(() =>
          callback(Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }), '', '')
        )
        return childProcessStub()
      })
      .mockImplementationOnce((_binary, _args, _options, callback) => {
        queueMicrotask(() => callback(null, 'authenticated', ''))
        return childProcessStub()
      })

    await expect(ghExecFileAsync(['auth', 'status'])).resolves.toEqual({
      stdout: 'authenticated',
      stderr: ''
    })
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      'wsl.exe',
      ['-d', 'Debian', '--', 'bash', '-c', "'gh' 'auth' 'status'"],
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('uses the same pinned distro for GitLab CLI fallback', async () => {
    setDefaultWslDistroOverride('Debian')
    getDefaultWslDistroMock.mockReturnValue('Ubuntu')
    execFileMock
      .mockImplementationOnce((_binary, _args, _options, callback) => {
        queueMicrotask(() =>
          callback(Object.assign(new Error('spawn glab ENOENT'), { code: 'ENOENT' }), '', '')
        )
        return childProcessStub()
      })
      .mockImplementationOnce((_binary, _args, _options, callback) => {
        queueMicrotask(() => callback(null, 'authenticated', ''))
        return childProcessStub()
      })

    await expect(glabExecFileAsync(['auth', 'status'])).resolves.toEqual({
      stdout: 'authenticated',
      stderr: ''
    })
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      'wsl.exe',
      ['-d', 'Debian', '--', 'bash', '-c', "'glab' 'auth' 'status'"],
      expect.any(Object),
      expect.any(Function)
    )
  })
})
