import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import {
  estimateCoworkingSessionInventorySnapshotBytes,
  COWORKING_SESSION_INVENTORY_SNAPSHOT_MAX_RETAINED_BYTES,
  COWORKING_SESSION_INVENTORY_SNAPSHOT_OPENING_RESERVATION_BYTES
} from '../ai-vault/coworking-session-inventory-memory-budget'
import {
  openRemoteAiVaultSessionInventory,
  readRemoteAiVaultSessionInventoryPage,
  type RemoteAiVaultSessionInventorySnapshot
} from '../ai-vault/remote-session-inventory'
import { AiVaultSessionInventoryCursorStore } from '../ai-vault/session/inventory-cursor-store'
import { SessionInventorySnapshotCache } from '../ai-vault/session/inventory-snapshot-cache'
import { SessionFileDiscoveryLimitError } from '../ai-vault/session/scanner-discovery'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { IFilesystemProvider } from '../providers/types'
import type { SshRelayAiVaultHostInfo } from '../ssh/relay/session'
import { getActiveSshAiVaultHostInfo } from '../ssh/ssh'
import { CoworkingExecutionError } from './execution-error'
import type {
  CoworkingExecutionHostSessionReader,
  CoworkingExecutionHostSessionReadRequest
} from './session/source'

const SSH_SESSION_INVENTORY_PAGE_SIZE = 64

/** Avoids reconnect because Public catalog reads must not prompt for credentials. */
export class YiruCoworkingSshSessionReader implements CoworkingExecutionHostSessionReader {
  // AI Vault rows are large; smaller host pages keep locator projections below RPC frame budgets.
  private readonly inventories =
    new AiVaultSessionInventoryCursorStore<RemoteAiVaultSessionInventorySnapshot>({
      pageSize: SSH_SESSION_INVENTORY_PAGE_SIZE
    })
  private readonly snapshots =
    new SessionInventorySnapshotCache<RemoteAiVaultSessionInventorySnapshot>({
      maxRetainedBytes: COWORKING_SESSION_INVENTORY_SNAPSHOT_MAX_RETAINED_BYTES,
      openingReservationBytes: COWORKING_SESSION_INVENTORY_SNAPSHOT_OPENING_RESERVATION_BYTES,
      measureSnapshotBytes: (snapshot) =>
        estimateCoworkingSessionInventorySnapshotBytes(snapshot.candidates)
    })

  async listMobileSessionTabs(): Promise<never> {
    throw new CoworkingExecutionError('resource_unavailable')
  }

  async listAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ) {
    const host = parseExecutionHostId(request.executionHostId)
    if (!host || host.kind !== 'ssh') {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const bindingKey = sshInventoryBindingKey(request)
    const snapshotKey = sshSnapshotKey(request)
    try {
      return await this.inventories.readPage({
        bindingKey,
        cursor,
        signal,
        openSnapshot: async (readSignal) =>
          await this.snapshots.resolve(
            snapshotKey,
            async (openingSignal) => {
              openingSignal.throwIfAborted()
              const active = requireActiveSshInventoryHost(host.targetId, request.executionHostId)
              // Provenance can retain transcripts without cwd, so discovery must not prefilter by path.
              const snapshot = await openRemoteAiVaultSessionInventory({
                provider: active.provider,
                targetId: host.targetId,
                executionHostId: request.executionHostId,
                remoteHome: active.hostInfo.remoteHome,
                hostPlatform: active.hostInfo.hostPlatform,
                signal: openingSignal
              })
              openingSignal.throwIfAborted()
              validateActiveSshInventoryHost(snapshot)
              return snapshot
            },
            readSignal
          ),
        readSnapshotPage: async (snapshot, offset, pageSize, readSignal) => {
          readSignal.throwIfAborted()
          validateActiveSshInventoryHost(snapshot)
          const page = await readRemoteAiVaultSessionInventoryPage(
            snapshot,
            offset,
            pageSize,
            readSignal
          )
          readSignal.throwIfAborted()
          validateActiveSshInventoryHost(snapshot)
          return page
        },
        validateSnapshot: validateActiveSshInventoryHost,
        releaseSnapshot: (snapshot) => this.snapshots.release(snapshot)
      })
    } catch (error) {
      if (!isSessionInventoryAbort(error)) {
        this.snapshots.invalidate(snapshotKey)
      }
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
    this.inventories.release(sshInventoryBindingKey(request), cursor)
  }
}

function isSessionInventoryAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function requireActiveSshInventoryHost(
  targetId: string,
  executionHostId: CoworkingExecutionHostSessionReadRequest['executionHostId']
): { hostInfo: SshRelayAiVaultHostInfo; provider: IFilesystemProvider } {
  const hostInfo = getActiveSshAiVaultHostInfo(targetId)
  const provider = getSshFilesystemProvider(targetId)
  if (
    !hostInfo ||
    !provider ||
    hostInfo.targetId !== targetId ||
    hostInfo.executionHostId !== executionHostId
  ) {
    throw new CoworkingExecutionError('resource_unavailable')
  }
  return { hostInfo, provider }
}

function validateActiveSshInventoryHost(snapshot: RemoteAiVaultSessionInventorySnapshot): void {
  const active = requireActiveSshInventoryHost(snapshot.targetId, snapshot.executionHostId)
  if (
    active.provider !== snapshot.provider ||
    active.hostInfo.remoteHome !== snapshot.remoteHome ||
    active.hostInfo.hostPlatform.relayPlatform !== snapshot.hostPlatform.relayPlatform
  ) {
    // Reconnects invalidate physical-path and provider authority captured by the cursor.
    throw new CoworkingExecutionError('resource_unavailable')
  }
}

function sshInventoryBindingKey(request: CoworkingExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.executionHostId,
    request.worktreeId,
    request.worktreeInstanceId,
    request.coworkingIncarnationId,
    request.worktreePath,
    request.localWslDistro,
    request.purpose,
    request.inventoryScope
  ])
}

function sshSnapshotKey(request: CoworkingExecutionHostSessionReadRequest): string {
  return JSON.stringify([request.inventoryScope, request.executionHostId])
}
