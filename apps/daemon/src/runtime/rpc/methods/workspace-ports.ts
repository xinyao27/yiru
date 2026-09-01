import type {
  RuntimeWorkspacePortKillResult,
  RuntimeWorkspacePortScanResult,
  WorkspacePortKillInput,
  WorkspacePortScanInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

// Why: Phase 6 D-stage — direct-wired only (orpc/router-direct/workspace.ts
// calls these plain handlers via `wireRuntimeMethod`). The legacy dual
// registration this domain used to need is gone: it existed only because the
// older remote clients fell back to a bare string method
// name on the legacy dispatcher, and that branch now dispatches through a
// negotiated oRPC peer instead (`createWebEnvironmentRuntimeOrpcClient`,
// docs/runtime-orpc-migration.md Phase 6 D-stage 切片 63/86).
export function scanRuntimeWorkspacePorts(
  params: WorkspacePortScanInput,
  { runtime }: RpcContext
): Promise<RuntimeWorkspacePortScanResult> {
  return runtime.scanWorkspacePorts(params.repoId)
}

export function killRuntimeWorkspacePort(
  params: WorkspacePortKillInput,
  { runtime }: RpcContext
): Promise<RuntimeWorkspacePortKillResult> {
  return runtime.killWorkspacePort(params)
}
