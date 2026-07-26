import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/workbench-model/workspace'

import type {
  CoworkingPairedRuntimeBoundWorktree,
  CoworkingPairedRuntimeResolvedWorktree,
  CoworkingPairedRuntimeWorktreeSelector
} from '../../../../shared/coworking/paired-runtime-host-contract'
import type { CoworkingPairedRuntimeSessionWorktree } from '../../../../shared/coworking/paired-runtime-session-contract'
import {
  coworkingActualHostScopeKey,
  coworkingLocalActualHostScopeKey
} from '../../../coworking/canonical-host-path'
import {
  CoworkingExecutionError,
  type CoworkingExecutionErrorCode
} from '../../../coworking/execution-error'
import type { CoworkingHostOperationContext } from '../../../coworking/execution-gateway'
import { resolveCoworkingRepoLocalWslDistro } from '../../../coworking/repo-actual-host-scope'
import type { CoworkingOwnerWorktree } from '../../../coworking/worktree-incarnation'
import { CoworkingActualHostWorktreeIncarnationHost } from '../../../coworking/worktree-incarnation-host'
import type { CoworkingPublicWorktreeInstance } from '../../../coworking/worktree-publication-state'
import { createYiruCoworkingHostAdapter } from '../../../coworking/yiru-host/adapter'
import { getLocalProjectWorktreeGitOptions } from '../../../project-runtime-git-options'
import type { YiruRuntimeService } from '../../yiru-runtime'
import type { RpcContext } from '../core'

const bundles = new WeakMap<YiruRuntimeService, ReturnType<typeof createYiruCoworkingHostAdapter>>()

export function requirePairedRuntimePrincipal(context: RpcContext): void {
  if (context.principal?.kind !== 'paired-device' || context.principal.scope !== 'runtime') {
    // Why: these methods are downstream owner operations, never a second Coworking admission path.
    throw new Error('paired_runtime_coworking_host_forbidden')
  }
}

export async function resolveActualHostWorktree(
  runtime: YiruRuntimeService,
  selector: CoworkingPairedRuntimeWorktreeSelector
): Promise<CoworkingPairedRuntimeResolvedWorktree> {
  return await runtime.resolvePairedRuntimeCoworkingWorktree(selector)
}

export function resolvePairedRuntimeRepoActualHostScope(
  runtime: YiruRuntimeService,
  repoId: string
): string {
  const store = runtime.getPairedRuntimeCoworkingStore()
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
    ? coworkingLocalActualHostScopeKey(
        executionHostId,
        resolveCoworkingRepoLocalWslDistro(
          repo.path,
          getLocalProjectWorktreeGitOptions(store, repo).wslDistro ?? null
        )
      )
    : coworkingActualHostScopeKey(executionHostId)
}

export async function resolveIncarnationBoundActualWorktree(
  runtime: YiruRuntimeService,
  selector: CoworkingPairedRuntimeSessionWorktree
): Promise<CoworkingPairedRuntimeResolvedWorktree & { actualHostScope: string }> {
  const resolved = await resolveActualHostWorktree(runtime, selector)
  const inspected = await createIncarnationHost(resolved).inspect(
    toOwnerWorktree(resolved),
    'resolve-or-create-marker'
  )
  if (inspected.status !== 'resolved') {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  if (inspected.markerId !== selector.coworkingIncarnationId) {
    throw new CoworkingExecutionError('resource_not_found')
  }
  return { ...resolved, actualHostScope: inspected.actualHostScope }
}

export async function resolveBoundActualHostWorktree(
  runtime: YiruRuntimeService,
  selector: CoworkingPairedRuntimeBoundWorktree
): Promise<CoworkingPublicWorktreeInstance> {
  const resolved = await resolveIncarnationBoundActualWorktree(runtime, selector)
  return {
    worktreeId: resolved.worktreeId,
    instanceId: resolved.instanceId,
    projectId: resolved.projectId,
    shareEpoch: selector.shareEpoch,
    coworkingIncarnationId: selector.coworkingIncarnationId,
    actualHostScope: resolved.actualHostScope,
    ownerWorktree: toOwnerWorktree(resolved)
  }
}

export function toOwnerWorktree(
  resolved: CoworkingPairedRuntimeResolvedWorktree
): CoworkingOwnerWorktree {
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
  resolved: CoworkingPairedRuntimeResolvedWorktree
): CoworkingActualHostWorktreeIncarnationHost {
  return new CoworkingActualHostWorktreeIncarnationHost({
    resolveLocalWslDistro: () => resolved.localWslDistro
  })
}

export function getHostBundle(runtime: YiruRuntimeService) {
  const existing = bundles.get(runtime)
  if (existing) {
    return existing
  }
  const created = createYiruCoworkingHostAdapter({
    store: runtime.getPairedRuntimeCoworkingStore(),
    runtime
  })
  bundles.set(runtime, created)
  return created
}

export function requireActualHostAdapter(
  runtime: YiruRuntimeService,
  target: CoworkingPublicWorktreeInstance
) {
  const adapter = getHostBundle(runtime).resolveAdapter(target)
  if (!adapter) {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return adapter
}

export function operationContext(
  channelRef: string,
  context: RpcContext,
  mutation: boolean
): CoworkingHostOperationContext {
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
    origin: 'coworking-owner'
  }
}

export function pairedRuntimeErrorCode(error: unknown): CoworkingExecutionErrorCode {
  return error instanceof CoworkingExecutionError ? error.code : 'resource_unavailable'
}
