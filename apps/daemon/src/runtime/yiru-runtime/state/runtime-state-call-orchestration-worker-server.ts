import {
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_VERSION
} from '@yiru/runtime-protocol/protocol-version'
import type { RuntimeOrchestrationEnvelope } from '@yiru/runtime-protocol/rpc-envelope'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '@yiru/runtime-protocol/workbench/runtime-method-contract'
import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'
import {
  isOrchestrationMutation,
  orchestrationMigrationData
} from '~main/orchestration/rpc-contract'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import { RuntimeFileCommands } from '~main/runtime/yiru-runtime-files'

import { RuntimeStatePtyTitleTrackersByPtyId } from './runtime-state-pty-title-trackers-by-pty-id'

export abstract class RuntimeStateCallOrchestrationWorkerServer extends RuntimeStatePtyTitleTrackersByPtyId {
  async callOrchestrationWorkerServer<TContract extends string | RuntimeMethodContract>(
    selector: string,
    contract: TContract,
    params: TContract extends RuntimeMethodContract ? RuntimeMethodParams<TContract> : unknown,
    timeoutMs?: number,
    envelope?: RuntimeOrchestrationEnvelope
  ): Promise<TContract extends RuntimeMethodContract ? RuntimeMethodResult<TContract> : unknown> {
    if (!this.orchestrationEnvironmentTransport) {
      throw new OrchestrationError(
        'server_required',
        'Remote-daemon orchestration is unavailable in this runtime host.'
      )
    }
    const method = typeof contract === 'string' ? contract : contract.name
    if (isOrchestrationMutation(method, params)) {
      const statusResponse = await this.orchestrationEnvironmentTransport.call(
        selector,
        'status.get',
        undefined,
        timeoutMs
      )
      if (statusResponse.ok === false) {
        throw new OrchestrationError(
          statusResponse.error.code,
          statusResponse.error.message,
          statusResponse.error.data
        )
      }
      const status = statusResponse.result as RuntimeStatus
      if (!status.capabilities?.includes(ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY)) {
        throw new OrchestrationError(
          'orchestration_migration_required',
          'The connected worker host does not support the current orchestration contract. No effects were applied.',
          orchestrationMigrationData('runtime_capability_missing')
        )
      }
    }
    const response = await this.orchestrationEnvironmentTransport.call(
      selector,
      contract,
      params,
      timeoutMs,
      method.startsWith('orchestration.')
        ? { ...envelope, orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION }
        : envelope
    )
    if (response.ok === false) {
      throw new OrchestrationError(response.error.code, response.error.message, response.error.data)
    }
    return response.result
  }

  readonly fileCommands = new RuntimeFileCommands({
    getRuntimeId: () => this.runtimeId,
    requireStore: () => this.requireStore(),
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    resolveRuntimeFileTarget: (selector) => this.resolveRuntimeFileTarget(selector),
    resolveTerminalCwd: (terminalHandle) => this.resolveTerminalCwd(terminalHandle),
    resolveTerminalContext: (terminalHandle) => this.resolveTerminalContext(terminalHandle),
    hasRecentTerminalOutputPath: (terminalHandle, pathText, absolutePath) =>
      this.hasRecentTerminalOutputPath(terminalHandle, pathText, absolutePath),
    resolveRuntimeGitTarget: (selector) => this.resolveRuntimeGitTarget(selector),
    openFile: (worktreeId, filePath, relativePath, runtimeEnvironmentId) => {
      if (
        !this.dispatchShellCommand({
          type: 'openFile',
          worktreeId,
          filePath,
          relativePath,
          runtimeEnvironmentId
        })
      ) {
        throw new Error('renderer_unavailable')
      }
    },
    openDiff: (worktreeId, filePath, relativePath, staged, runtimeEnvironmentId) => {
      if (
        !this.dispatchShellCommand({
          type: 'openDiff',
          worktreeId,
          filePath,
          relativePath,
          staged,
          runtimeEnvironmentId
        })
      ) {
        throw new Error('renderer_unavailable')
      }
    }
  })

  closeFileWatchersForRemoval = async (worktreePath: string): Promise<void> => {
    await this.fileCommands.closeFileExplorerWatchersForPath(worktreePath)
  }

  restoreFileWatchersAfterFailedRemoval = async (worktreePath: string): Promise<void> => {
    await this.fileCommands.restoreFileExplorerWatchersAfterFailedRemoval(worktreePath)
  }

  forgetFileWatchersAfterRemoval = (worktreePath: string): void => {
    this.fileCommands.forgetFileExplorerWatchersAfterRemoval(worktreePath)
  }
}
