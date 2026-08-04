import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  listLocalCoworkingSessionInventoryPage,
  releaseLocalCoworkingSessionInventoryPage
} from '../ai-vault/local-coworking-session-inventory'
import { SessionFileDiscoveryLimitError } from '../ai-vault/session/scanner-discovery'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingExecutionHostSessionReader,
  CoworkingExecutionHostSessionReadRequest,
  CoworkingMobileSessionTabsResult,
  CoworkingObservedProviderSession
} from './session/source'

type CoworkingSessionRuntime = Pick<
  YiruRuntimeService,
  'listMobileSessionTabs' | 'onMobileSessionTabsChanged'
>

const MAX_LOCAL_SESSION_READ_REQUESTS = 256

/** Reads only owner-side session projections; it never opens an execution route. */
export class YiruCoworkingExecutionHostSessionReader implements CoworkingExecutionHostSessionReader {
  private readonly localReadRequests = new Map<string, CoworkingExecutionHostSessionReadRequest>()

  constructor(
    private readonly runtime: CoworkingSessionRuntime,
    private readonly pairedRuntime?: CoworkingExecutionHostSessionReader
  ) {}

  registerPublicWorktree(request: CoworkingExecutionHostSessionReadRequest): void {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      this.pairedRuntime?.registerPublicWorktree?.(request)
      return
    }
    this.rememberLocalReadRequest(request)
  }

  unregisterPublicWorktree(request: CoworkingExecutionHostSessionReadRequest): void {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      this.pairedRuntime?.unregisterPublicWorktree?.(request)
      return
    }
    this.localReadRequests.delete(
      localReadRequestKey(request.worktreeId, request.worktreeInstanceId)
    )
  }

  async listMobileSessionTabs(
    request: CoworkingExecutionHostSessionReadRequest,
    signal?: AbortSignal
  ) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listMobileSessionTabs(request, signal)
    }
    const tabs = await this.runtime.listMobileSessionTabs(`id:${request.worktreeId}`)
    signal?.throwIfAborted()
    this.rememberLocalReadRequest(request)
    return tabs
  }

  async listAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listAiVaultSessionPage(request, cursor, signal)
    }
    try {
      return await listLocalCoworkingSessionInventoryPage({
        bindingKey: inventoryBindingKey(request),
        cursor,
        executionHostId: request.executionHostId,
        inventoryScope: request.inventoryScope,
        worktreePath: request.worktreePath,
        localWslDistro: request.localWslDistro,
        signal
      })
    } catch (error) {
      if (error instanceof SessionFileDiscoveryLimitError) {
        throw new CoworkingExecutionError('result_too_large')
      }
      throw error instanceof CoworkingExecutionError
        ? error
        : new CoworkingExecutionError(
            error instanceof Error && error.message.includes('capacity')
              ? 'resource_busy'
              : 'resource_unavailable'
          )
    }
  }

  async releaseAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void> {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      await this.requirePairedRuntime().releaseAiVaultSessionPage(request, cursor)
      return
    }
    releaseLocalCoworkingSessionInventoryPage({
      bindingKey: inventoryBindingKey(request),
      cursor,
      executionHostId: request.executionHostId,
      inventoryScope: request.inventoryScope,
      worktreePath: request.worktreePath,
      localWslDistro: request.localWslDistro
    })
  }

  subscribe(
    listener: (
      snapshot?: CoworkingMobileSessionTabsResult,
      request?: CoworkingExecutionHostSessionReadRequest,
      providerSessions?: readonly CoworkingObservedProviderSession[]
    ) => void
  ): () => void {
    const unsubscribeLocal = this.runtime.onMobileSessionTabsChanged((snapshot) =>
      listener(snapshot, this.resolveLocalReadRequest(snapshot))
    )
    const unsubscribeRuntime = this.pairedRuntime?.subscribe?.(listener) ?? (() => {})
    return () => {
      unsubscribeLocal()
      unsubscribeRuntime()
    }
  }

  private requirePairedRuntime(): CoworkingExecutionHostSessionReader {
    if (!this.pairedRuntime) {
      // Why: a Public read cannot initiate pairing, reconnect, or a credential prompt.
      throw new CoworkingExecutionError('resource_unavailable')
    }
    return this.pairedRuntime
  }

  private rememberLocalReadRequest(request: CoworkingExecutionHostSessionReadRequest): void {
    const key = localReadRequestKey(request.worktreeId, request.worktreeInstanceId)
    this.localReadRequests.delete(key)
    this.localReadRequests.set(key, request)
    while (this.localReadRequests.size > MAX_LOCAL_SESSION_READ_REQUESTS) {
      const oldest = this.localReadRequests.keys().next().value
      if (!oldest) {
        break
      }
      this.localReadRequests.delete(oldest)
    }
  }

  private resolveLocalReadRequest(
    snapshot: CoworkingMobileSessionTabsResult
  ): CoworkingExecutionHostSessionReadRequest | undefined {
    let matched: CoworkingExecutionHostSessionReadRequest | undefined
    for (const tab of snapshot.tabs) {
      if (tab.type !== 'terminal' || tab.status !== 'ready' || !tab.worktreeInstanceId) {
        continue
      }
      const request = this.localReadRequests.get(
        localReadRequestKey(snapshot.worktree, tab.worktreeInstanceId)
      )
      if (!request) {
        continue
      }
      if (matched && matched !== request) {
        // Why: one hook snapshot cannot safely attest sessions from multiple execution routes.
        return undefined
      }
      matched = request
    }
    if (matched) {
      return matched
    }
    for (const request of this.localReadRequests.values()) {
      if (request.worktreeId !== snapshot.worktree) {
        continue
      }
      if (matched && matched !== request) {
        return undefined
      }
      matched = request
    }
    // Why: an empty/removed Public worktree snapshot has no terminal instance
    // to join on, but a unique registered worktree route is still authoritative.
    return matched
  }
}

function localReadRequestKey(worktreeId: string, worktreeInstanceId: string): string {
  return JSON.stringify([worktreeId, worktreeInstanceId])
}

function inventoryBindingKey(request: CoworkingExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.worktreeId,
    request.worktreeInstanceId,
    request.coworkingIncarnationId,
    request.worktreePath,
    request.localWslDistro,
    request.purpose,
    request.inventoryScope
  ])
}

function requireExecutionHost(request: CoworkingExecutionHostSessionReadRequest) {
  const host = parseExecutionHostId(request.executionHostId)
  if (!host) {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return host
}
