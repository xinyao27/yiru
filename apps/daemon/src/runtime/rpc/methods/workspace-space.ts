import type {
  RuntimeWorkspaceSpaceAnalyzeResult,
  RuntimeWorkspaceSpaceCancelResult
} from '@yiru/runtime-protocol/contract'

import type { RpcHandler } from '../core'

export const handleWorkspaceSpaceAnalyze = ((_params, { runtime }) =>
  runtime.analyzeWorkspaceSpace()) satisfies RpcHandler<void, RuntimeWorkspaceSpaceAnalyzeResult>

// Why: aborts a shared host-wide singleton scan, which may have been started
// by a different paired client — same destructive-to-others category as
// `terminal.management.killOne`.
export const handleWorkspaceSpaceCancel = ((_params, { runtime }) => ({
  cancelled: runtime.cancelWorkspaceSpaceScan()
})) satisfies RpcHandler<void, RuntimeWorkspaceSpaceCancelResult>
