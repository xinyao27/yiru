import { parseExecutionHostId } from '../../shared/execution-host'
import type {
  SpoolExecutionOperation,
  SpoolTerminalCreateHostResult,
  SpoolTerminalLaunchOptionsResult
} from '../../shared/spool/spool-operation-contract'
import { isSpoolAgentLaunchId } from '../../shared/spool/spool-agent-launch-contract'
import { TUI_AGENT_DISPLAY_NAMES } from '../../shared/tui-agent-display-names'
import { isTuiAgent } from '../../shared/tui-agent-config'
import {
  isTuiAgentEnabled,
  pickTuiAgent,
  TUI_AGENT_AUTO_PICK_ORDER
} from '../../shared/tui-agent-selection'
import type { TuiAgent } from '../../shared/types'
import { detectInstalledAgentsWithShellPathHydration, detectRemoteAgents } from '../ipc/preflight'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolHostOperationContext } from './spool-execution-gateway'
import { spoolLiveTerminalSessionKey } from './spool-session-resolution'
import {
  spoolTerminalCreateFingerprint,
  SpoolTerminalCreateLedger
} from './spool-terminal-create-ledger'
import { SpoolTerminalLaunchOptionsCache } from './spool-terminal-launch-options-cache'
import type { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

type TerminalLaunchOperation = Extract<
  SpoolExecutionOperation,
  { kind: 'terminal.launchOptions' | 'terminal.create' }
>

type SpoolTerminalLaunchRuntime = Pick<YiruRuntimeService, 'createAgentTerminal' | 'createTerminal'>

/** Owns semantic terminal launch policy without accepting requester shell material. */
export class YiruSpoolHostTerminalLaunch {
  private readonly launchOptionsCache = new SpoolTerminalLaunchOptionsCache()
  private readonly createLedger = new SpoolTerminalCreateLedger()

  constructor(
    private readonly runtime: SpoolTerminalLaunchRuntime,
    private readonly store: Store,
    private readonly sessionBindings: SpoolTerminalSessionBindings
  ) {}

  async invoke(
    target: SpoolPublicWorktreeInstance,
    operation: TerminalLaunchOperation,
    context: SpoolHostOperationContext
  ): Promise<SpoolTerminalLaunchOptionsResult | SpoolTerminalCreateHostResult> {
    if (operation.kind === 'terminal.launchOptions') {
      return await this.launchOptions(target, context.signal)
    }
    const guard = context.admissionGuard
    if (!guard) {
      throw new SpoolExecutionError('unauthorized')
    }
    return await this.createLedger.run(
      {
        connectionId: context.connectionId,
        instanceId: target.instanceId,
        shareEpoch: target.shareEpoch,
        spoolIncarnationId: target.spoolIncarnationId,
        clientMutationId: operation.clientMutationId,
        fingerprint: spoolTerminalCreateFingerprint(operation.launch)
      },
      async () => {
        context.signal.throwIfAborted()
        const agent = operation.launch.kind === 'agent' ? operation.launch.agent : null
        if (agent) {
          const options = await this.launchOptions(target, context.signal, true)
          if (!options.agents.includes(agent)) {
            throw new SpoolExecutionError('resource_unavailable')
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
            throw new SpoolExecutionError('resource_unavailable')
          }
          await guard.beforeSideEffect()
          spawnAdmitted = true
        }
        const title = agent ? TUI_AGENT_DISPLAY_NAMES[agent] : 'Terminal'
        let created: Awaited<ReturnType<SpoolTerminalLaunchRuntime['createTerminal']>>
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
            throw new SpoolExecutionError('outcome_unknown')
          }
          throw error
        }
        const terminalHandle = requireCreatedTerminalHandle(
          created.handle,
          created.worktreeId,
          target
        )
        const provider = spoolProvider(agent)
        this.sessionBindings.rememberSpawned(
          target,
          terminalHandle,
          agent
            ? { provider, sessionKind: 'agent', agent, title }
            : { provider, sessionKind: 'terminal', agent: null, title }
        )
        return {
          terminalHandle,
          sessionKey: spoolLiveTerminalSessionKey(target, terminalHandle),
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
    target: SpoolPublicWorktreeInstance,
    signal: AbortSignal,
    forceFresh = false
  ): Promise<SpoolTerminalLaunchOptionsResult> {
    const detect = async (): Promise<readonly TuiAgent[]> => await this.detectAgents(target)
    const detected = await (forceFresh
      ? this.launchOptionsCache.refresh(target.actualHostScope, detect)
      : this.launchOptionsCache.read(target.actualHostScope, detect))
    signal.throwIfAborted()
    const settings = this.store.getSettings()
    const detectedSet = new Set(detected)
    const agents = TUI_AGENT_AUTO_PICK_ORDER.filter(isSpoolAgentLaunchId).filter(
      (agent) => detectedSet.has(agent) && isTuiAgentEnabled(agent, settings.disabledTuiAgents)
    )
    const pickedDefault = pickTuiAgent(settings.defaultTuiAgent, agents, settings.disabledTuiAgents)
    return {
      agents,
      defaultAgent: isSpoolAgentLaunchId(pickedDefault) ? pickedDefault : null
    }
  }

  private async detectAgents(target: SpoolPublicWorktreeInstance): Promise<readonly TuiAgent[]> {
    const host = parseExecutionHostId(target.ownerWorktree.executionHostId)
    if (!host || host.kind === 'runtime') {
      throw new SpoolExecutionError('resource_unavailable')
    }
    const detected =
      host.kind === 'ssh'
        ? await detectRemoteAgents({ connectionId: host.targetId })
        : await this.detectLocalAgents(target)
    return detected.filter(isTuiAgent)
  }

  private async detectLocalAgents(target: SpoolPublicWorktreeInstance): Promise<string[]> {
    const repo = this.store.getRepo(target.ownerWorktree.repoId)
    if (!repo) {
      throw new SpoolExecutionError('resource_not_found')
    }
    const { wslDistro } = getLocalProjectWorktreeGitOptions(this.store, repo)
    return await detectInstalledAgentsWithShellPathHydration(wslDistro ? { wslDistro } : undefined)
  }
}

function spoolProvider(agent: TuiAgent | null): 'claude' | 'codex' | 'other' {
  return agent === 'claude' || agent === 'codex' ? agent : 'other'
}

function requireCreatedTerminalHandle(
  handle: string,
  worktreeId: string,
  target: SpoolPublicWorktreeInstance
): string {
  if (
    !handle ||
    handle.length > 2_048 ||
    handle.includes('\0') ||
    worktreeId !== target.worktreeId
  ) {
    // Why: a malformed response may still name a running PTY, so retry safety is unknown.
    throw new SpoolExecutionError('outcome_unknown')
  }
  return handle
}
