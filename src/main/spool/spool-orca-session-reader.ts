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
  SpoolExecutionHostSessionReadRequest
} from './spool-session-source'

type SpoolSessionRuntime = Pick<
  OrcaRuntimeService,
  'listMobileSessionTabs' | 'onMobileSessionTabsChanged'
>

/** Reads only owner-side session projections; it never opens an execution route. */
export class OrcaSpoolExecutionHostSessionReader implements SpoolExecutionHostSessionReader {
  constructor(
    private readonly runtime: SpoolSessionRuntime,
    private readonly pairedRuntime?: SpoolExecutionHostSessionReader,
    private readonly ssh?: SpoolExecutionHostSessionReader
  ) {}

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest, signal?: AbortSignal) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listMobileSessionTabs(request, signal)
    }
    // Why: SSH PTYs are already represented by the owner runtime's session graph.
    const tabs = await this.runtime.listMobileSessionTabs(`id:${request.worktreeId}`)
    signal?.throwIfAborted()
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

  subscribe(listener: () => void): () => void {
    const unsubscribeLocal = this.runtime.onMobileSessionTabsChanged(() => listener())
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
