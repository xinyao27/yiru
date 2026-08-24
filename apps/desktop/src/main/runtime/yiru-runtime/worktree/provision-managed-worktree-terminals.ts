import { randomUUID } from 'node:crypto'

import {
  buildObservedSetupCommand,
  createSetupCompletionScanner
} from '~main/runtime/orchestration/setup-completion-signal'
import { isShellProcess } from '~shared/agent/detection'
import { isExpectedAgentProcess } from '~shared/agent/process-recognition'
import { buildSetupRunnerCommand } from '~shared/setup/runner-command'
import type { CreateWorktreeResult, GlobalSettings } from '~shared/types'

import { RuntimeWorktreeRecordCreatedWorktreeLineage } from './record-created-worktree-lineage'

export abstract class RuntimeWorktreeProvisionManagedWorktreeTerminals extends RuntimeWorktreeRecordCreatedWorktreeLineage {
  protected async provisionManagedWorktreeTerminals(args: {
    worktreeSelector: string
    worktreeId: string
    worktreePath: string
    setup?: CreateWorktreeResult['setup']
    defaultTabs?: CreateWorktreeResult['defaultTabs']
    primaryTerminalHandle?: string | null
    hasStartupTerminal: boolean
    setupCommandPlatform: 'windows' | 'posix'
    observeSetupCompletion?: boolean
    // Why: when the agent startup is sequenced to wait for setup
    // (waitForAgentStartup), the startup PTY runs a wrapper that already embeds
    // the setup command. Pass that wrapped command through so the Setup tab runs
    // the same script the agent is waiting on instead of a bare runner.
    wrappedSetupCommand?: string
  }): Promise<{ setupSpawned: boolean; setupTerminalHandle: string | null }> {
    if (!this.ptyController?.spawn) {
      return { setupSpawned: false, setupTerminalHandle: null }
    }
    let setupSpawned = false
    let setupTerminalHandle: string | null = null
    try {
      const defaultTabHandles = await this.createDefaultTabTerminals(
        args.worktreeSelector,
        args.worktreeId,
        args.defaultTabs
      )
      let primaryTerminalHandle = args.primaryTerminalHandle ?? defaultTabHandles[0] ?? null
      const setupLaunchMode =
        (
          this.requireStore().getSettings() as Partial<
            Pick<GlobalSettings, 'setupScriptLaunchMode'>
          >
        ).setupScriptLaunchMode ?? 'new-tab'
      if (!args.hasStartupTerminal && !primaryTerminalHandle) {
        const terminal = await this.createTerminal(args.worktreeSelector)
        primaryTerminalHandle = terminal.handle
      }
      if (args.setup) {
        const completionToken =
          args.observeSetupCompletion && !args.wrappedSetupCommand ? randomUUID() : null
        const observedCommand = completionToken
          ? buildObservedSetupCommand(
              args.setup.runnerScriptPath,
              args.setupCommandPlatform,
              completionToken
            )
          : null
        const setupCommand =
          args.wrappedSetupCommand ??
          observedCommand?.command ??
          buildSetupRunnerCommand(args.setup.runnerScriptPath, args.setupCommandPlatform)
        const setupEnv = { ...args.setup.envVars, ...observedCommand?.env }
        const shouldSplitSetup =
          primaryTerminalHandle &&
          (setupLaunchMode === 'split-vertical' || setupLaunchMode === 'split-horizontal')
        const setupTerminal = await (shouldSplitSetup
          ? this.splitTerminal(primaryTerminalHandle!, {
              direction: setupLaunchMode === 'split-horizontal' ? 'horizontal' : 'vertical',
              command: setupCommand,
              env: setupEnv,
              activate: false
            })
          : this.createTerminal(args.worktreeSelector, {
              title: 'Setup',
              command: setupCommand,
              env: setupEnv
            }))
        setupTerminalHandle = setupTerminal.handle
        setupSpawned = true
        const ptyId = this.getLivePtyForHandle(setupTerminal.handle)?.pty.ptyId
        if (completionToken && ptyId) {
          this.setupCompletionTokenByPtyId.set(ptyId, completionToken)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[worktree-create] Failed to create setup/default terminals for ${args.worktreePath}: ${message}`
      )
    }
    return { setupSpawned, setupTerminalHandle }
  }

  async waitForSetupTerminalCompletion(handle: string): Promise<{ exitCode: number | null }> {
    const ptyId = this.getLivePtyForHandle(handle)?.pty.ptyId
    if (!ptyId) {
      throw new Error('terminal_handle_stale')
    }
    const completionToken = this.setupCompletionTokenByPtyId.get(ptyId)
    const exitAbort = new AbortController()
    return await new Promise<{ exitCode: number | null }>((resolve, reject) => {
      let settled = false
      let unsubscribe: (() => void) | null = null
      const cleanup = (): void => {
        unsubscribe?.()
        exitAbort.abort()
      }
      const finish = (exitCode: number | null): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        this.setupCompletionTokenByPtyId.delete(ptyId)
        resolve({ exitCode })
      }
      const fail = (error: unknown): void => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        reject(error)
      }
      const scanner = completionToken ? createSetupCompletionScanner(completionToken, finish) : null
      if (scanner) {
        unsubscribe = this.subscribeToTerminalData(ptyId, scanner.scan)
      }
      const replay = this.recentPtyOutputById.get(ptyId)
      if (scanner && replay) {
        scanner.scan(replay)
      }
      if (!settled) {
        void this.waitForTerminal(handle, { condition: 'exit', signal: exitAbort.signal })
          .then((wait) => {
            if (wait.satisfied && wait.condition === 'exit' && wait.status === 'exited') {
              finish(wait.exitCode)
            }
          })
          .catch(fail)
      }
    })
  }

  protected async waitForStartupFollowupReady(
    handle: string,
    expectedProcess: string
  ): Promise<string | null> {
    const livePty = this.getLivePtyForHandle(handle)
    const ptyId = livePty?.pty.ptyId
    if (!ptyId || !this.ptyController) {
      return null
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      try {
        const foregroundProcess = await this.ptyController.getForegroundProcess(ptyId)
        if (isExpectedAgentProcess(foregroundProcess, expectedProcess)) {
          return ptyId
        }
        if (attempt >= 4 && !isShellProcess(foregroundProcess ?? '')) {
          const hasChildProcesses =
            (await this.ptyController.hasChildProcesses?.(ptyId).catch(() => false)) ?? false
          if (hasChildProcesses) {
            return ptyId
          }
        }
      } catch {
        // Ignore transient PTY inspection failures and keep polling.
      }
    }
    return null
  }
}
