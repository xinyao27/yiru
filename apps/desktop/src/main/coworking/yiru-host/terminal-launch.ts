import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { isCoworkingAgentLaunchId } from '../../../shared/coworking/agent-launch-contract'
import type {
  CoworkingExecutionOperation,
  CoworkingTerminalCreateHostResult,
  CoworkingTerminalLaunchOptionsResult
} from '../../../shared/coworking/operation-contract'
import { isTuiAgent } from '../../../shared/tui-agent/config'
import { TUI_AGENT_DISPLAY_NAMES } from '../../../shared/tui-agent/display-names'
import {
  isTuiAgentEnabled,
  pickTuiAgent,
  TUI_AGENT_AUTO_PICK_ORDER
} from '../../../shared/tui-agent/selection'
import type { TuiAgent } from '../../../shared/types'
import type { Store } from '../../persistence'
import {
  detectInstalledAgentsWithShellPathHydration,
  detectRemoteAgents
} from '../../preflight/preflight'
import { getLocalProjectWorktreeGitOptions } from '../../project-runtime-git-options'
import type { YiruRuntimeService } from '../../runtime/yiru-runtime'
import { CoworkingExecutionError } from '../execution-error'
import type { CoworkingHostOperationContext } from '../execution-gateway'
import { coworkingLiveTerminalSessionKey } from '../session/resolution'
import {
  coworkingTerminalCreateFingerprint,
  CoworkingTerminalCreateLedger
} from '../terminal-create-ledger'
import { CoworkingTerminalLaunchOptionsCache } from '../terminal-launch-options-cache'
import type { CoworkingTerminalSessionBindings } from '../terminal-session-bindings'
import type { CoworkingPublicWorktreeInstance } from '../worktree-publication-state'

type TerminalLaunchOperation = Extract<
  CoworkingExecutionOperation,
  { kind: 'terminal.launchOptions' | 'terminal.create' }
>

type CoworkingTerminalLaunchRuntime = Pick<
  YiruRuntimeService,
  'createAgentTerminal' | 'createTerminal'
>

/** Owns semantic terminal launch policy without accepting requester shell material. */
export class YiruCoworkingHostTerminalLaunch {
  private readonly launchOptionsCache = new CoworkingTerminalLaunchOptionsCache()
  private readonly createLedger = new CoworkingTerminalCreateLedger()

  constructor(
    private readonly runtime: CoworkingTerminalLaunchRuntime,
    private readonly store: Store,
    private readonly sessionBindings: CoworkingTerminalSessionBindings
  ) {}

  async invoke(
    target: CoworkingPublicWorktreeInstance,
    operation: TerminalLaunchOperation,
    context: CoworkingHostOperationContext
  ): Promise<CoworkingTerminalLaunchOptionsResult | CoworkingTerminalCreateHostResult> {
    if (operation.kind === 'terminal.launchOptions') {
      return await this.launchOptions(target, context.signal)
    }
    const guard = context.admissionGuard
    if (!guard) {
      throw new CoworkingExecutionError('unauthorized')
    }
    return await this.createLedger.run(
      {
        connectionId: context.connectionId,
        instanceId: target.instanceId,
        shareEpoch: target.shareEpoch,
        coworkingIncarnationId: target.coworkingIncarnationId,
        clientMutationId: operation.clientMutationId,
        fingerprint: coworkingTerminalCreateFingerprint(operation.launch)
      },
      async () => {
        context.signal.throwIfAborted()
        const agent = operation.launch.kind === 'agent' ? operation.launch.agent : null
        if (agent) {
          const options = await this.launchOptions(target, context.signal, true)
          if (!options.agents.includes(agent)) {
            throw new CoworkingExecutionError('resource_unavailable')
          }
        }
        const beforeAgentTrust = async (): Promise<void> => {
          context.signal.throwIfAborted()
          await guard.beforeSideEffect()
        }
        let spawnAdmitted = false
        const beforeSpawn = async (): Promise<void> => {
          context.signal.throwIfAborted()
          if (agent && !isTuiAgentEnabled(agent, this.store.getSettings().disabledTuiAgents)) {
            // Why: an owner disabling an agent must win until the final spawn boundary.
            throw new CoworkingExecutionError('resource_unavailable')
          }
          await guard.beforeSideEffect()
          spawnAdmitted = true
        }
        const title = agent ? TUI_AGENT_DISPLAY_NAMES[agent] : 'Terminal'
        let created: Awaited<ReturnType<CoworkingTerminalLaunchRuntime['createTerminal']>>
        try {
          created = agent
            ? await this.runtime.createAgentTerminal(`id:${target.worktreeId}`, {
                agent,
                title,
                presentation: 'background',
                beforeAgentTrust,
                beforeSpawn
              })
            : await this.runtime.createTerminal(`id:${target.worktreeId}`, {
                title,
                presentation: 'background',
                beforeSpawn
              })
        } catch (error) {
          if (spawnAdmitted) {
            // Why: after the final spawn guard, a host error cannot prove no PTY was created.
            throw new CoworkingExecutionError('outcome_unknown')
          }
          throw error
        }
        const terminalHandle = requireCreatedTerminalHandle(
          created.handle,
          created.worktreeId,
          target
        )
        const provider = coworkingProvider(agent)
        this.sessionBindings.rememberSpawned(
          target,
          terminalHandle,
          agent
            ? { provider, sessionKind: 'agent', agent, title }
            : { provider, sessionKind: 'terminal', agent: null, title }
        )
        return {
          terminalHandle,
          sessionKey: coworkingLiveTerminalSessionKey(target, terminalHandle),
          provider,
          title
        }
      }
    )
  }

  closeConnection(connectionId: string): void {
    this.createLedger.closeConnection(connectionId)
  }

  private async launchOptions(
    target: CoworkingPublicWorktreeInstance,
    signal: AbortSignal,
    forceFresh = false
  ): Promise<CoworkingTerminalLaunchOptionsResult> {
    const detect = async (): Promise<readonly TuiAgent[]> => await this.detectAgents(target)
    const detected = await (forceFresh
      ? this.launchOptionsCache.refresh(target.actualHostScope, detect)
      : this.launchOptionsCache.read(target.actualHostScope, detect))
    signal.throwIfAborted()
    const settings = this.store.getSettings()
    const detectedSet = new Set(detected)
    const agents = TUI_AGENT_AUTO_PICK_ORDER.filter(isCoworkingAgentLaunchId).filter(
      (agent) => detectedSet.has(agent) && isTuiAgentEnabled(agent, settings.disabledTuiAgents)
    )
    const pickedDefault = pickTuiAgent(settings.defaultTuiAgent, agents, settings.disabledTuiAgents)
    return {
      agents,
      defaultAgent: isCoworkingAgentLaunchId(pickedDefault) ? pickedDefault : null
    }
  }

  private async detectAgents(
    target: CoworkingPublicWorktreeInstance
  ): Promise<readonly TuiAgent[]> {
    const host = parseExecutionHostId(target.ownerWorktree.executionHostId)
    if (!host || host.kind === 'runtime') {
      throw new CoworkingExecutionError('resource_unavailable')
    }
    const detected =
      host.kind === 'ssh'
        ? await detectRemoteAgents({ connectionId: host.targetId })
        : await this.detectLocalAgents(target)
    return detected.filter(isTuiAgent)
  }

  private async detectLocalAgents(target: CoworkingPublicWorktreeInstance): Promise<string[]> {
    const repo = this.store.getRepo(target.ownerWorktree.repoId)
    if (!repo) {
      throw new CoworkingExecutionError('resource_not_found')
    }
    const { wslDistro } = getLocalProjectWorktreeGitOptions(this.store, repo)
    return await detectInstalledAgentsWithShellPathHydration(wslDistro ? { wslDistro } : undefined)
  }
}

function coworkingProvider(agent: TuiAgent | null): 'claude' | 'codex' | 'other' {
  return agent === 'claude' || agent === 'codex' ? agent : 'other'
}

function requireCreatedTerminalHandle(
  handle: string,
  worktreeId: string,
  target: CoworkingPublicWorktreeInstance
): string {
  if (
    !handle ||
    handle.length > 2_048 ||
    handle.includes('\0') ||
    worktreeId !== target.worktreeId
  ) {
    // Why: a malformed response may still name a running PTY, so retry safety is unknown.
    throw new CoworkingExecutionError('outcome_unknown')
  }
  return handle
}
