import { parseExecutionHostId } from '../../shared/execution-host'
import { scanRemoteAiVaultSessions } from '../ai-vault/remote-session-scanner'
import { getActiveSshAiVaultHostInfo } from '../ipc/ssh'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import { SpoolExecutionError } from './spool-execution-error'
import type {
  SpoolExecutionHostSessionReader,
  SpoolExecutionHostSessionReadRequest
} from './spool-session-source'

/** Avoids reconnect because Public catalog reads must not prompt for credentials. */
export class OrcaSpoolSshSessionReader implements SpoolExecutionHostSessionReader {
  async listMobileSessionTabs(): Promise<never> {
    throw new SpoolExecutionError('resource_unavailable')
  }

  async listAiVaultSessions(request: SpoolExecutionHostSessionReadRequest) {
    const host = parseExecutionHostId(request.executionHostId)
    if (!host || host.kind !== 'ssh') {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const hostInfo = getActiveSshAiVaultHostInfo(host.targetId)
    const filesystem = getSshFilesystemProvider(host.targetId)
    if (!hostInfo || !filesystem || hostInfo.executionHostId !== request.executionHostId) {
      throw new SpoolExecutionError('resource_unavailable')
    }
    return scanRemoteAiVaultSessions({
      provider: filesystem,
      executionHostId: request.executionHostId,
      remoteHome: hostInfo.remoteHome,
      hostPlatform: hostInfo.hostPlatform,
      limit: 5_000,
      scopePaths: [request.worktreePath]
    })
  }
}
