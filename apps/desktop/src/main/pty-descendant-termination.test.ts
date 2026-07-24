import { describe, expect, it, vi } from 'vite-plus/test'

import { killWithDescendantSweep } from './pty-descendant-termination'

describe('killWithDescendantSweep', () => {
  it('kills the Windows process tree before root cleanup', async () => {
    const events: string[] = []
    const killWindowsTree = vi.fn(async () => {
      events.push('tree')
    })
    const killRoot = vi.fn(() => events.push('root'))

    await killWithDescendantSweep(4242, killRoot, {
      platform: 'win32',
      killWindowsTree
    })

    expect(killWindowsTree).toHaveBeenCalledWith(4242)
    expect(events).toEqual(['tree', 'root'])
  })

  it('does not invoke taskkill on non-Windows hosts', async () => {
    const killWindowsTree = vi.fn()
    const killRoot = vi.fn()

    await killWithDescendantSweep(4242, killRoot, {
      platform: 'linux',
      killWindowsTree,
      readTable: async () => ({ rows: [], capturedAtMs: Date.now() })
    })

    expect(killWindowsTree).not.toHaveBeenCalled()
    expect(killRoot).toHaveBeenCalledOnce()
  })

  it('skips a stale Windows tree but still delegates root cleanup', async () => {
    const killWindowsTree = vi.fn()
    const killRoot = vi.fn()

    await killWithDescendantSweep(4242, killRoot, {
      platform: 'win32',
      killWindowsTree,
      ownsRoot: () => false
    })

    expect(killWindowsTree).not.toHaveBeenCalled()
    expect(killRoot).toHaveBeenCalledOnce()
  })

  it('still delegates root cleanup when Windows tree termination fails', async () => {
    const killRoot = vi.fn()

    await killWithDescendantSweep(4242, killRoot, {
      platform: 'win32',
      killWindowsTree: async () => {
        throw new Error('taskkill failed')
      }
    })

    expect(killRoot).toHaveBeenCalledOnce()
  })
})
