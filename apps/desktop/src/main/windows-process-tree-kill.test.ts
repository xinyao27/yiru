import { describe, expect, it, vi } from 'vite-plus/test'

import {
  terminateWindowsProcessTree,
  WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS
} from './windows-process-tree-kill'

describe('terminateWindowsProcessTree', () => {
  it('bounds and hides taskkill while terminating the full descendant tree', async () => {
    const execFileImpl = vi.fn((_command, _args, _options, callback) => callback(null))

    await terminateWindowsProcessTree(1234, { execFileImpl: execFileImpl as never })

    expect(execFileImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '1234', '/T', '/F'],
      { timeout: WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS, windowsHide: true },
      expect.any(Function)
    )
  })

  it('skips invalid process ids', async () => {
    const execFileImpl = vi.fn()

    await terminateWindowsProcessTree(0, { execFileImpl: execFileImpl as never })

    expect(execFileImpl).not.toHaveBeenCalled()
  })
})
