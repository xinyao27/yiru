import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { createSequencedSetupAgentCommands } from '~shared/setup/agent-sequencing'
import { getSetupRunnerCommandPlatformForPath } from '~shared/setup/runner-command'
import type { CreateWorktreeResult } from '~shared/types'

import type { ManagedWorktreePreparedContext } from '../model/managed-worktree-create'
import { RuntimeWorktreePrepareManagedWorktree } from './prepare-managed-worktree'

export abstract class RuntimeWorktreeCompleteManagedWorktreeCreate extends RuntimeWorktreePrepareManagedWorktree {
  protected async completeManagedWorktreeCreate(
    context: ManagedWorktreePreparedContext
  ): Promise<CreateWorktreeResult> {
    const {
      addResult,
      args,
      created,
      defaultTabs,
      effectiveCreatedWithAgent,
      effectiveDecision,
      effectiveDraftPaste,
      effectiveStartup,
      effectiveStartupFollowup,
      hasSetupHook,
      lineage,
      lineageInput,
      lineageWarnings,
      repo,
      setup,
      shouldRunSetup,
      worktree,
      worktreePath,
      workspaceLineage
    } = context
    let warning = context.warning
    const shouldActivate = args.activate === true || args.runHooks === true
    let didSpawnStartup = false
    let didSpawnSetup = false
    let setupTerminalHandle: string | null = null
    let startupTerminalHandle: string | null = null
    let startupTerminalTabId: string | null = null
    let startupTerminalPaneKey: string | null = null
    let startupTerminalPtyId: string | null = null

    let sequencedStartup = effectiveStartup
    let wrappedSetupCommand: string | undefined
    if (effectiveStartup && setup?.waitForAgentStartup === true) {
      const platform = getSetupRunnerCommandPlatformForPath(
        setup.runnerScriptPath,
        process.platform === 'win32' ? 'windows' : 'posix'
      )
      const sequenced = createSequencedSetupAgentCommands({
        runnerScriptPath: setup.runnerScriptPath,
        startupCommand: effectiveStartup.command,
        platform
      })
      sequencedStartup = {
        ...effectiveStartup,
        command: sequenced.startupCommand,
        ...(sequenced.startupEnv
          ? { env: { ...effectiveStartup.env, ...sequenced.startupEnv } }
          : {})
      }
      wrappedSetupCommand = sequenced.setupCommand
    }

    if (sequencedStartup && this.ptyController?.spawn) {
      try {
        // Why: startup must not depend on a renderer terminal mounting.
        const startupTrustAgent = effectiveDraftPaste?.agent ?? effectiveCreatedWithAgent
        if (startupTrustAgent) {
          this.markLocalWorkspaceTrustedForAgent(startupTrustAgent, worktreePath)
        }
        const terminal = await this.createTerminal(`id:${worktree.id}`, {
          command: sequencedStartup.command,
          ...(setup && effectiveStartup
            ? { claudeAgentTeamsSourceCommand: effectiveStartup.command }
            : {}),
          env: sequencedStartup.env,
          ...(sequencedStartup.launchConfig ? { launchConfig: sequencedStartup.launchConfig } : {}),
          ...(effectiveCreatedWithAgent ? { launchAgent: effectiveCreatedWithAgent } : {}),
          startupCommandDelivery: sequencedStartup.startupCommandDelivery,
          telemetry: sequencedStartup.telemetry
        })
        if (effectiveDraftPaste) {
          this.pasteStartupDraftWhenReady(terminal.handle, effectiveDraftPaste)
        }
        if (effectiveStartupFollowup) {
          this.sendStartupFollowupWhenReady(terminal.handle, effectiveStartupFollowup)
        }
        didSpawnStartup = true
        startupTerminalHandle = terminal.handle
        startupTerminalTabId = terminal.tabId ?? null
        startupTerminalPaneKey = terminal.paneKey ?? null
        startupTerminalPtyId = terminal.ptyId ?? null
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warning = warning
          ? `${warning} Also failed to create the startup terminal for ${worktreePath}: ${message}`
          : `Failed to create the startup terminal for ${worktreePath}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }

    const provisioningArgs = {
      worktreeSelector: `id:${worktree.id}`,
      worktreeId: worktree.id,
      worktreePath,
      ...(setup ? { setup } : {}),
      ...(defaultTabs ? { defaultTabs } : {}),
      primaryTerminalHandle: startupTerminalHandle,
      hasStartupTerminal: didSpawnStartup,
      setupCommandPlatform: setup
        ? isWindowsAbsolutePathLike(setup.runnerScriptPath)
          ? ('windows' as const)
          : ('posix' as const)
        : ('posix' as const),
      observeSetupCompletion: args.observeSetupCompletion,
      ...(wrappedSetupCommand ? { wrappedSetupCommand } : {})
    }
    if (shouldActivate) {
      const runtimeWillProvisionTerminals = didSpawnStartup && Boolean(setup || defaultTabs)
      if (runtimeWillProvisionTerminals) {
        // Why: renderer activation may skip setup after adopting a startup PTY.
        const provisioned = await this.provisionManagedWorktreeTerminals(provisioningArgs)
        didSpawnSetup = provisioned.setupSpawned
        setupTerminalHandle = provisioned.setupTerminalHandle
      }
      const activationSetup = didSpawnSetup
        ? undefined
        : setup
          ? {
              ...setup,
              ...(didSpawnStartup && wrappedSetupCommand ? { command: wrappedSetupCommand } : {})
            }
          : undefined
      const activationDefaultTabs = runtimeWillProvisionTerminals ? undefined : defaultTabs
      if (effectiveStartup && !didSpawnStartup) {
        this.notifyActivateWorktree(
          repo.id,
          worktree.id,
          activationSetup,
          effectiveStartup,
          activationDefaultTabs
        )
      } else {
        this.notifyActivateWorktree(
          repo.id,
          worktree.id,
          activationSetup,
          undefined,
          activationDefaultTabs
        )
      }
    } else if (this.ptyController?.spawn && (setup || defaultTabs || didSpawnStartup)) {
      // Why: inactive setup failures must not block background callers.
      const provisioning = this.provisionManagedWorktreeTerminals(provisioningArgs)
      if (args.awaitTerminalProvisioning) {
        const provisioned = await provisioning
        didSpawnSetup = provisioned.setupSpawned
        setupTerminalHandle = provisioned.setupTerminalHandle
      } else {
        void provisioning
        if (setup) {
          didSpawnSetup = true
        }
      }
    } else if (this.ptyController?.spawn) {
      try {
        await this.createTerminal(`id:${worktree.id}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warning = warning
          ? `${warning} Also failed to create the initial terminal for ${worktreePath}: ${message}`
          : `Failed to create the initial terminal for ${worktreePath}: ${message}`
        console.warn(`[worktree-create] ${warning}`)
      }
    }
    const returnedSetup = didSpawnSetup
      ? undefined
      : setup
        ? {
            ...setup,
            ...(didSpawnStartup && wrappedSetupCommand ? { command: wrappedSetupCommand } : {})
          }
        : undefined
    return {
      worktree: {
        ...worktree,
        parentWorktreeId: lineage?.parentWorktreeId ?? null,
        childWorktreeIds: [],
        lineage,
        workspaceLineage,
        git: created
      },
      ...(lineageInput ? { lineage, workspaceLineage, warnings: lineageWarnings } : {}),
      ...(returnedSetup ? { setup: returnedSetup } : {}),
      ...(args.awaitTerminalProvisioning
        ? {
            setupReceipt: {
              requested: effectiveDecision,
              hookFound: hasSetupHook,
              startupPolicy: setup?.waitForAgentStartup
                ? ('wait-for-setup' as const)
                : ('start-immediately' as const),
              state: !hasSetupHook
                ? ('not_configured' as const)
                : effectiveDecision === 'skip' || !shouldRunSetup
                  ? ('skipped' as const)
                  : didSpawnSetup
                    ? ('running' as const)
                    : ('spawn_failed' as const),
              ...(setupTerminalHandle ? { terminalHandle: setupTerminalHandle } : {})
            }
          }
        : {}),
      ...(defaultTabs ? { defaultTabs } : {}),
      ...(warning ? { warning } : {}),
      ...(addResult.localBaseRefRefresh
        ? { localBaseRefRefresh: addResult.localBaseRefRefresh }
        : {}),
      ...(addResult.localBaseRefUpdateSuggestion
        ? { localBaseRefUpdateSuggestion: addResult.localBaseRefUpdateSuggestion }
        : {}),
      ...(didSpawnStartup && startupTerminalHandle
        ? {
            startupTerminal: {
              spawned: true,
              handle: startupTerminalHandle,
              ...(startupTerminalTabId ? { tabId: startupTerminalTabId } : {}),
              ...(startupTerminalPaneKey ? { paneKey: startupTerminalPaneKey } : {}),
              ...(startupTerminalPtyId ? { ptyId: startupTerminalPtyId } : {}),
              surface: 'background' as const
            }
          }
        : {})
    }
  }
}
