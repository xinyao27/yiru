import { parseExecutionHostId } from '../../shared/execution-host'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest
} from './spool-session-source'

type SpoolSessionRuntime = Pick<
  OrcaRuntimeService,
  'listMobileSessionTabs' | 'listAiVaultSessions' | 'onMobileSessionTabsChanged'
>

/** Reads only owner-side session projections; it never opens an execution route. */
export class OrcaSpoolExecutionHostSessionReader implements SpoolExecutionHostSessionReader {
  constructor(
    private readonly runtime: SpoolSessionRuntime,
    private readonly pairedRuntime?: SpoolExecutionHostSessionReader,
    private readonly ssh?: SpoolExecutionHostSessionReader
  ) {}

  async listMobileSessionTabs(request: SpoolExecutionHostSessionReadRequest) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listMobileSessionTabs(request)
    }
    // Why: SSH PTYs are already represented by the owner runtime's session graph.
    return await this.runtime.listMobileSessionTabs(`id:${request.worktreeId}`)
  }

  async listAiVaultSessions(request: SpoolExecutionHostSessionReadRequest) {
    const host = requireExecutionHost(request)
    if (host.kind === 'runtime') {
      return await this.requirePairedRuntime().listAiVaultSessions(request)
    }
    if (host.kind === 'ssh') {
      if (this.ssh) {
        return await this.ssh.listAiVaultSessions(request)
      }
      // Why: owner-local AI Vault data must never be projected as an SSH host's history.
      return { sessions: [], issues: [], scannedAt: new Date().toISOString() }
    }
    return await this.runtime.listAiVaultSessions({
      limit: 5_000,
      force: false,
      scopePaths: [request.worktreePath],
      executionHostScope: request.executionHostId
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

function requireExecutionHost(request: SpoolExecutionHostSessionReadRequest) {
  const host = parseExecutionHostId(request.executionHostId)
  if (!host) {
    throw new SpoolExecutionError('resource_unavailable')
  }
  return host
}
