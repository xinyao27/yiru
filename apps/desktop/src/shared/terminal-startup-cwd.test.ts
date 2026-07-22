import { describe, expect, it } from 'vite-plus/test'

import { GLOBAL_ASSISTANT_WORKTREE_ID } from './constants'
import { resolveTerminalStartupCwdForWorkspace } from './terminal-startup-cwd'

describe('resolveTerminalStartupCwdForWorkspace', () => {
  it('preserves the app-owned cwd for the global assistant PTY', () => {
    const assistantCwd =
      process.platform === 'win32'
        ? 'C:\\Users\\test\\Yiru\\assistant'
        : '/Users/test/Yiru/assistant'

    expect(
      resolveTerminalStartupCwdForWorkspace({
        workspaceId: GLOBAL_ASSISTANT_WORKTREE_ID,
        requestedCwd: assistantCwd
      })
    ).toBe(assistantCwd)
  })
})
