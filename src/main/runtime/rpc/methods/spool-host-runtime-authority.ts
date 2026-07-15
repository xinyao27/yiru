import type { OrcaRuntimeService } from '../../orca-runtime'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import type {
  SpoolPairedRuntimeBoundWorktree,
  SpoolPairedRuntimeResolvedWorktree,
  SpoolPairedRuntimeWorktreeSelector
} from '../../../../shared/spool/spool-paired-runtime-host-contract'
import type { SpoolPairedRuntimeSessionWorktree } from '../../../../shared/spool/spool-paired-runtime-session-contract'
import {
  SpoolExecutionError,
  type SpoolExecutionErrorCode
} from '../../../spool/spool-execution-error'
import type { SpoolHostOperationContext } from '../../../spool/spool-execution-gateway'
import { createOrcaSpoolHostAdapter } from '../../../spool/spool-orca-host-adapter'
import type { SpoolOwnerWorktree } from '../../../spool/spool-worktree-incarnation'
import { SpoolActualHostWorktreeIncarnationHost } from '../../../spool/spool-worktree-incarnation-host'
import {
  spoolActualHostScopeKey,
  spoolLocalActualHostScopeKey
} from '../../../spool/spool-canonical-host-path'
import { getLocalProjectWorktreeGitOptions } from '../../../project-runtime-git-options'
import { resolveSpoolRepoLocalWslDistro } from '../../../spool/spool-repo-actual-host-scope'
import type { SpoolPublicWorktreeInstance } from '../../../spool/spool-worktree-publication-state'
import type { RpcContext } from '../core'

const bundles = new WeakMap<OrcaRuntimeService, ReturnType<typeof createOrcaSpoolHostAdapter>>()

export function requirePairedRuntimePrincipal(context: RpcContext): void {
  if (context.principal?.kind !== 'paired-device' || context.principal.scope !== 'runtime') {
    // Why: these methods are downstream owner operations, never a second Spool admission path.
    throw new Error('paired_runtime_spool_host_forbidden')
  }
}

export async function resolveActualHostWorktree(
  runtime: OrcaRuntimeService,
  selector: SpoolPairedRuntimeWorktreeSelector
): Promise<SpoolPairedRuntimeResolvedWorktree> {
  return await runtime.resolvePairedRuntimeSpoolWorktree(selector)
}

export function resolvePairedRuntimeRepoActualHostScope(
  runtime: OrcaRuntimeService,
  repoId: string
): string {
  const store = runtime.getPairedRuntimeSpoolStore()
  const repo = store.getRepo(repoId)
  if (!repo) {
    throw new Error('repo_not_found')
  }
  const executionHostId = getRepoExecutionHostId(repo)
  const host = parseExecutionHostId(executionHostId)
  if (!host || host.kind === 'runtime') {
    throw new Error('recursive_runtime_host')
  }
  return host.kind === 'local'
    ? spoolLocalActualHostScopeKey(
        executionHostId,
        resolveSpoolRepoLocalWslDistro(
          repo.path,
          getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
        )
      )
    : spoolActualHostScopeKey(executionHostId)
}

export async function resolveIncarnationBoundActualWorktree(
  runtime: OrcaRuntimeService,
  selector: SpoolPairedRuntimeSessionWorktree
): Promise<SpoolPairedRuntimeResolvedWorktree & { actualHostScope: string }> {
  const resolved = await resolveActualHostWorktree(runtime, selector)
  const inspected = await createIncarnationHost(resolved).inspect(
    toOwnerWorktree(resolved),
    'resolve-or-create-marker'
  )
  if (inspected.status !== 'resolved') {
    throw new SpoolExecutionError('resource_unavailable')
  }
  if (inspected.markerId !== selector.spoolIncarnationId) {
    throw new SpoolExecutionError('resource_not_found')
  }
  return { ...resolved, actualHostScope: inspected.actualHostScope }
}

export async function resolveBoundActualHostWorktree(
  runtime: OrcaRuntimeService,
  selector: SpoolPairedRuntimeBoundWorktree
): Promise<SpoolPublicWorktreeInstance> {
  const resolved = await resolveIncarnationBoundActualWorktree(runtime, selector)
  return {
    worktreeId: resolved.worktreeId,
    instanceId: resolved.instanceId,
    projectId: resolved.projectId,
    shareEpoch: selector.shareEpoch,
    spoolIncarnationId: selector.spoolIncarnationId,
    actualHostScope: resolved.actualHostScope,
    target: toOwnerWorktree(resolved)
  }
}

export function toOwnerWorktree(resolved: SpoolPairedRuntimeResolvedWorktree): SpoolOwnerWorktree {
  return {
    kind: resolved.kind,
    worktreeId: resolved.worktreeId,
    instanceId: resolved.instanceId,
    projectId: resolved.projectId,
    repoId: resolved.repoId,
    executionHostId: resolved.executionHostId,
    connectionId: resolved.connectionId,
    ...(resolved.projectHostSetupId ? { projectHostSetupId: resolved.projectHostSetupId } : {}),
    worktreePath: resolved.worktreePath
  }
}

export function createIncarnationHost(
  resolved: SpoolPairedRuntimeResolvedWorktree
): SpoolActualHostWorktreeIncarnationHost {
  return new SpoolActualHostWorktreeIncarnationHost({
    resolveLocalWslDistro: () => resolved.localWslDistro
  })
}

export function getHostBundle(runtime: OrcaRuntimeService) {
  const existing = bundles.get(runtime)
  if (existing) {
    return existing
  }
  const created = createOrcaSpoolHostAdapter({
    store: runtime.getPairedRuntimeSpoolStore(),
    runtime
  })
  bundles.set(runtime, created)
  return created
}

export function requireActualHostAdapter(
  runtime: OrcaRuntimeService,
  target: SpoolPublicWorktreeInstance
) {
  const adapter = getHostBundle(runtime).resolveAdapter(target)
  if (!adapter) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return adapter
}

export function operationContext(
  channelRef: string,
  context: RpcContext,
  mutation: boolean
): SpoolHostOperationContext {
  const signal = context.signal ?? new AbortController().signal
  return {
    connectionId: channelRef,
    signal,
    ...(mutation
      ? {
          admissionGuard: {
            // Why: this request exists only after owner admission at authenticated transmission.
            beforeSideEffect: () => Promise.resolve()
          }
        }
      : {}),
    origin: 'spool-owner'
  }
}

export function pairedRuntimeErrorCode(error: unknown): SpoolExecutionErrorCode {
  return error instanceof SpoolExecutionError ? error.code : 'resource_unavailable'
}
