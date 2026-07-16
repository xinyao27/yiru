import { parseExecutionHostId } from '../../shared/execution-host'
import {
  listLocalSpoolSessionInventoryPage,
  releaseLocalSpoolSessionInventoryPage
} from '../ai-vault/local-spool-session-inventory'
import { SessionFileDiscoveryLimitError } from '../ai-vault/session-scanner-discovery'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest,
  SpoolMobileSessionTabsResult,
  SpoolObservedProviderSession
} from './spool-session-source'

type SpoolSessionRuntime = Pick<
  OrcaRuntimeService,
  'listMobileSessionTabs' | 'onMobileSessionTabsChanged'
>

const MAX_LOCAL_SESSION_READ_REQUESTS = 256

/** Reads only owner-side session projections; it never opens an execution route. */
export class OrcaSpoolExecutionHostSessionReader implements SpoolExecutionHostSessionReader {
  private readonly localReadRequests = new Map<string, SpoolExecutionHostSessionReadRequest>()

  constructor(
    private readonly runtime: SpoolSessionRuntime,
    private readonly pairedRuntime?: SpoolExecutionHostSessionReader,
    private readonly ssh?: SpoolExecutionHostSessionReader
  ) {}

  registerPublicWorktree(request: SpoolExecutionHostSessionReadRequest): void {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      this.pairedRuntime?.registerPublicWorktree?.(request)
      return
    }
    this.rememberLocalReadRequest(request)
  }

  unregisterPublicWorktree(request: SpoolExecutionHostSessionReadRequest): void {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      this.pairedRuntime?.unregisterPublicWorktree?.(request)
      return
    }
    this.localReadRequests.delete(
      localReadRequestKey(request.worktreeId, request.worktreeInstanceId)
    )
  }

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest, signal?: AbortSignal) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listMobileSessionTabs(request, signal)
    }
    // Why: SSH PTYs are already represented by the owner runtime's session graph.
    const tabs = await this.runtime.listMobileSessionTabs(`id:${request.worktreeId}`)
    signal?.throwIfAborted()
    this.rememberLocalReadRequest(request)
    return tabs
  }

  async listAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listAiVaultSessionPage(request, cursor, signal)
    }
    if (host.kind === 'ssh') {
      if (this.ssh) {
        return await this.ssh.listAiVaultSessionPage(request, cursor, signal)
      }
      // Why: owner-local AI Vault data must never be projected as an SSH host's history.
      throw new SpoolExecutionError('resource_unavailable')
    }
    try {
      return await listLocalSpoolSessionInventoryPage({
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
        throw new SpoolExecutionError('result_too_large')
      }
      throw error instanceof SpoolExecutionError
        ? error
        : new SpoolExecutionError(
            error instanceof Error && error.message.includes('capacity')
              ? 'resource_busy'
              : 'resource_unavailable'
          )
    }
  }

  async releaseAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void> {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      await this.requirePairedRuntime().releaseAiVaultSessionPage(request, cursor)
      return
    }
    if (host.kind === 'ssh') {
      await this.ssh?.releaseAiVaultSessionPage(request, cursor)
      return
    }
    releaseLocalSpoolSessionInventoryPage({
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
      snapshot?: SpoolMobileSessionTabsResult,
      request?: SpoolExecutionHostSessionReadRequest,
      providerSessions?: readonly SpoolObservedProviderSession[]
    ) => void
  ): () => void {
    const unsubscribeLocal = this.runtime.onMobileSessionTabsChanged((snapshot) =>
      listener(snapshot, this.resolveLocalReadRequest(snapshot))
    )
    const unsubscribeRuntime = this.pairedRuntime?.subscribe?.(listener) ?? (() => {})
    const unsubscribeSsh = this.ssh?.subscribe?.(listener) ?? (() => {})
    return () => {
      unsubscribeLocal()
      unsubscribeRuntime()
      unsubscribeSsh()
    }
  }

  private requirePairedRuntime(): SpoolExecutionHostSessionReader {
    if (!this.pairedRuntime) {
      // Why: a Public read cannot initiate pairing, reconnect, or a credential prompt.
      throw new SpoolExecutionError('resource_unavailable')
    }
    return this.pairedRuntime
  }

  private rememberLocalReadRequest(request: SpoolExecutionHostSessionReadRequest): void {
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
    snapshot: SpoolMobileSessionTabsResult
  ): SpoolExecutionHostSessionReadRequest | undefined {
    let matched: SpoolExecutionHostSessionReadRequest | undefined
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

function inventoryBindingKey(request: SpoolExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.worktreeId,
    request.worktreeInstanceId,
    request.spoolIncarnationId,
    request.worktreePath,
    request.localWslDistro,
    request.purpose,
    request.inventoryScope
  ])
}

function requireExecutionHost(request: SpoolExecutionHostSessionReadRequest) {
  const host = parseExecutionHostId(request.executionHostId)
  if (!host) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return host
}
