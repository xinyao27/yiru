import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isResumableTuiAgent } from '@yiru/workbench-model/agent'
import { isAiVaultSessionResumableContent } from '@yiru/workbench-model/agent'
import { isNativeChatSupportedAgent } from '@yiru/workbench-model/agent'
import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/workbench-model/platform'

import { GLOBAL_ASSISTANT_WORKTREE_ID } from '../../shared/constants'
import type { GlobalAssistantSession } from '../../shared/global-assistant-types'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'
import {
  getTuiAgentDefaultArgs,
  getTuiAgentDefaultEnv
} from '../../shared/tui-agent-launch-defaults'
import { isTuiAgentEnabled, pickTuiAgent } from '../../shared/tui-agent-selection'
import {
  buildAgentResumeStartupPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '../../shared/tui-agent-startup'
import type { AgentStartupShell } from '../../shared/tui-agent-startup-shell'
import type { TuiAgent } from '../../shared/types'
import {
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from '../agent-trust-presets'
import { detectInstalledAgentsWithShellPathHydration } from '../ipc/preflight'
import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'

const ASSISTANT_IDENTITY = `# Yiru Global Assistant

You are Yiru's global assistant. Help the user operate Yiru, coordinate work across projects,
and inspect local or connected workspaces through the Yiru CLI.

## Operating Yiru

- Use \`yiru worktree list\` to inspect workspaces and \`yiru worktree show --worktree <selector>\` for details.
- Use \`yiru worktree create --repo <repo> --name <name> --agent <agent> --prompt <task>\` to dispatch work.
- Use \`yiru terminal list\`, \`yiru terminal read --terminal <handle>\`, and \`yiru terminal send --terminal <handle> --text <text> --enter\` to work with terminals.
- Use \`yiru orchestration task-list\` and related orchestration commands to coordinate tasks.
- Use \`yiru automations list\` and \`yiru automations runs --id <automation>\` to inspect automations.
- Use \`yiru automations run <automation>\` to trigger an automation immediately.
- Use \`yiru sessions list\` or \`yiru sessions search <query>\` to find prior AI sessions.
- Run \`yiru --help\` or \`yiru <group> --help\` when you need the current command contract.

Read \`YIRU_CLI_COMMAND\` and use its value as the executable when it is set; this points to the
active CLI command in development builds. Otherwise use \`yiru\` as shown above.

## Safety

Always ask for confirmation immediately before deleting a workspace, stopping a terminal or
automation, removing a session, or taking another destructive action. Explain exactly what will
be affected. Never assume the currently selected workspace is local; Yiru may be connected to an
SSH host.
`

export class GlobalAssistantService {
  private session: GlobalAssistantSession | null = null
  private creating: Promise<GlobalAssistantSession> | null = null
  private disposed = false

  constructor(
    private readonly store: Store,
    private readonly runtime: YiruRuntimeService,
    private readonly userDataPath: string
  ) {}

  async getOrCreate(): Promise<GlobalAssistantSession> {
    if (this.disposed) {
      throw new Error('Global Assistant is shutting down.')
    }
    let session = this.session
    if (!session || !(await this.isAlive(session))) {
      this.session = null
      session = await this.startCreatingSession('resume')
    }
    return this.revealSession(session)
  }

  async restart(): Promise<GlobalAssistantSession> {
    if (this.disposed) {
      throw new Error('Global Assistant is shutting down.')
    }
    const pending = this.creating
    if (pending) {
      await pending.catch(() => undefined)
    }
    const current = this.session
    this.session = null
    if (current) {
      await this.runtime.closeTerminal(current.handle).catch(() => undefined)
    }
    const session = await this.startCreatingSession('fresh')
    return this.revealSession(session)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const pending = this.creating
    if (pending) {
      await pending.catch(() => undefined)
    }
    const current = this.session
    this.session = null
    if (current) {
      await this.runtime.closeTerminal(current.handle).catch(() => undefined)
    }
  }

  private startCreatingSession(mode: 'resume' | 'fresh'): Promise<GlobalAssistantSession> {
    if (!this.creating) {
      this.creating = this.createSession(mode).finally(() => {
        this.creating = null
      })
    }
    return this.creating
  }

  private async revealSession(session: GlobalAssistantSession): Promise<GlobalAssistantSession> {
    const tabId = await this.runtime.revealGlobalAssistantChat(session.handle)
    const revealed = tabId === session.tabId ? session : { ...session, tabId }
    this.session = revealed
    return revealed
  }

  private async createSession(mode: 'resume' | 'fresh'): Promise<GlobalAssistantSession> {
    const assistantPath = join(this.userDataPath, 'assistant')
    await this.ensureIdentityFiles(assistantPath)
    const agent = await this.resolveAgent()
    this.markWorkspaceTrusted(agent, assistantPath)

    const settings = this.store.getSettings()
    const agentArgs = getTuiAgentDefaultArgs(agent)
    const agentEnv = getTuiAgentDefaultEnv(agent)
    const shell = resolveLocalWindowsAgentStartupShell({
      platform: process.platform,
      isRemote: false,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    // Why: the assistant must operate Yiru unattended even when ordinary
    // workspace agents are configured to stop for per-tool approval.
    const startup =
      mode === 'resume'
        ? await this.buildResumeStartup(agent, assistantPath, agentArgs, agentEnv, shell)
        : null
    const effectiveStartup =
      startup ??
      buildAgentStartupPlan({
        agent,
        prompt: '',
        cmdOverrides: settings.agentCmdOverrides ?? {},
        agentArgs,
        agentEnv,
        platform: process.platform,
        shell,
        allowEmptyPromptLaunch: true
      })
    if (!effectiveStartup) {
      throw new Error(`Could not build the ${agent} launch command for Global Assistant.`)
    }

    const terminal = await this.runtime.createTerminal(GLOBAL_ASSISTANT_WORKTREE_ID, {
      command: effectiveStartup.launchCommand,
      cwd: assistantPath,
      ...(effectiveStartup.env ? { env: effectiveStartup.env } : {}),
      launchConfig: effectiveStartup.launchConfig,
      launchAgent: agent,
      ...(effectiveStartup.startupCommandDelivery
        ? { startupCommandDelivery: effectiveStartup.startupCommandDelivery }
        : {}),
      viewMode: 'chat',
      title: 'Yiru Assistant',
      presentation: 'background',
      // Why: this PTY exists only for native chat until the user explicitly
      // chooses the raw-terminal escape; mobile/session tab lists stay clean.
      deferMobileSessionPublish: true
    })
    if (!terminal.tabId || !terminal.paneKey || !terminal.ptyId) {
      await this.runtime.closeTerminal(terminal.handle).catch(() => undefined)
      throw new Error('Global Assistant started without a usable terminal identity.')
    }
    return {
      agent,
      handle: terminal.handle,
      paneKey: terminal.paneKey,
      ptyId: terminal.ptyId,
      tabId: terminal.tabId,
      worktreeId: GLOBAL_ASSISTANT_WORKTREE_ID
    }
  }

  private async buildResumeStartup(
    agent: TuiAgent,
    assistantPath: string,
    agentArgs: string,
    agentEnv: Record<string, string>,
    shell: AgentStartupShell | undefined
  ): Promise<AgentStartupPlan | null> {
    if (!isResumableTuiAgent(agent)) {
      return null
    }
    const result = await this.runtime
      .listAiVaultSessions({ limit: 50, scopePaths: [assistantPath] })
      .catch(() => null)
    const assistantPathKey = normalizeRuntimePathForComparison(assistantPath)
    const previous = result?.sessions.find(
      (session) =>
        session.agent === agent &&
        session.cwd !== null &&
        normalizeRuntimePathForComparison(session.cwd) === assistantPathKey &&
        isAiVaultSessionResumableContent(session)
    )
    if (!previous) {
      return null
    }
    return buildAgentResumeStartupPlan({
      agent,
      providerSession: { key: 'session_id', id: previous.sessionId },
      cmdOverrides: this.store.getSettings().agentCmdOverrides ?? {},
      agentArgs,
      agentEnv,
      platform: process.platform,
      shell
    })
  }

  private async resolveAgent(): Promise<TuiAgent> {
    const settings = this.store.getSettings()
    const preferred = settings.defaultTuiAgent
    if (preferred === 'blank') {
      throw new Error('Choose a native-chat capable default agent before opening Global Assistant.')
    }
    if (preferred) {
      if (!isTuiAgentEnabled(preferred, settings.disabledTuiAgents)) {
        throw new Error(`The default agent ${preferred} is disabled.`)
      }
      if (!isNativeChatSupportedAgent(preferred)) {
        throw new Error(`The default agent ${preferred} does not support native chat.`)
      }
      return preferred
    }

    const detected = (await detectInstalledAgentsWithShellPathHydration())
      .filter(isTuiAgent)
      .filter(isNativeChatSupportedAgent)
    const picked = pickTuiAgent(null, detected, settings.disabledTuiAgents)
    if (!picked) {
      throw new Error(
        'Install or enable Claude, OpenClaude, Codex, or Grok to use Global Assistant.'
      )
    }
    return picked
  }

  private async ensureIdentityFiles(assistantPath: string): Promise<void> {
    await mkdir(assistantPath, { recursive: true })
    // Why: both Claude-family and Codex-family agents read their own identity
    // filename; exclusive creation preserves any user customization thereafter.
    await Promise.all([
      writeIdentityFile(join(assistantPath, 'CLAUDE.md')),
      writeIdentityFile(join(assistantPath, 'AGENTS.md'))
    ])
  }

  private markWorkspaceTrusted(agent: TuiAgent, assistantPath: string): void {
    const preset = TUI_AGENT_CONFIG[agent].preflightTrust
    try {
      if (preset === 'cursor') {
        markCursorWorkspaceTrusted(assistantPath)
      } else if (preset === 'copilot') {
        markCopilotFolderTrusted(assistantPath)
      } else if (preset === 'codex') {
        markCodexProjectTrusted(assistantPath)
      }
    } catch {
      // Best-effort: an agent trust prompt is recoverable in raw-terminal mode.
    }
  }

  private async isAlive(session: GlobalAssistantSession): Promise<boolean> {
    try {
      await this.runtime.getTerminalAgentStatus(session.handle)
      return true
    } catch {
      return false
    }
  }
}

async function writeIdentityFile(filePath: string): Promise<void> {
  try {
    await writeFile(filePath, ASSISTANT_IDENTITY, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }
}
