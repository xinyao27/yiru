import { captureTerminalShutdownBuffersBestEffort } from '@/runtime/terminal-shutdown-buffer-captures'

import {
  shouldPreserveTerminalScrollbackBuffers,
  type RepoConnection
} from '../../../../shared/workspace/session-terminal-buffers'

export function captureForceParkedWorktreeBuffers(args: {
  worktreeId: string
  tabIds: readonly string[]
  repos: readonly RepoConnection[]
}): boolean {
  if (!shouldPreserveTerminalScrollbackBuffers(args.worktreeId, args.repos)) {
    return true
  }
  const { requested, captured } = captureTerminalShutdownBuffersBestEffort(args.tabIds, {
    includeLocalBuffers: false
  })
  return captured === requested
}
