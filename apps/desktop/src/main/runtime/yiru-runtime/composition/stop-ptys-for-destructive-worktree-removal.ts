import { killAllProcessesForWorktree } from '~main/runtime/worktree-teardown'

import { RuntimeBrowserBrowserCommands } from '../browser/browser-commands'

export abstract class RuntimeCompositionStopPtysForDestructiveWorktreeRemoval extends RuntimeBrowserBrowserCommands {
  protected async stopPtysForDestructiveWorktreeRemoval(
    worktreeId: string,
    connectionId?: string
  ): Promise<void> {
    const provider = connectionId ? this.getSshProviderFn?.(connectionId) : this.getLocalProvider()
    if (!provider) {
      throw new Error(`PTY provider unavailable for worktree deletion: ${worktreeId}`)
    }
    const teardownResult = await killAllProcessesForWorktree(worktreeId, {
      runtime: this,
      localProvider: provider,
      onPtyStopped: this.onPtyStopped ?? undefined,
      requirePhysicalStop: true,
      ...(connectionId ? { includeLocalRegistry: false } : {})
    })
    const total =
      teardownResult.runtimeStopped +
      teardownResult.providerStopped +
      teardownResult.registryStopped
    if (total > 0) {
      console.info(
        `[worktree-teardown] ${worktreeId} killed runtime=${teardownResult.runtimeStopped} provider=${teardownResult.providerStopped} registry=${teardownResult.registryStopped}`
      )
    }
  }

  async syncOrchestrationFederation(runId?: string): Promise<void> {
    if (!this.orchestrationEnvironmentTransport) {
      return
    }
    const dispatches = this.getOrchestrationDb().listActiveFederatedDispatches(runId)
    await Promise.allSettled(
      dispatches.map((dispatch) => this.syncOrchestrationFederatedDispatch(dispatch.dispatch_id))
    )
  }
}
