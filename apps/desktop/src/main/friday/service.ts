import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isResumableTuiAgent } from '@yiru/workbench-model/agent'
import { isAiVaultSessionResumableContent } from '@yiru/workbench-model/agent'
import { isNativeChatSupportedAgent } from '@yiru/workbench-model/agent'
import { normalizeRuntimePathForComparison } from '@yiru/workbench-model/platform'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/workbench-model/platform'
import { FRIDAY_WORKTREE_ID } from '~shared/constants'
import type { FridaySession } from '~shared/friday-types'
import { isTuiAgent, TUI_AGENT_CONFIG } from '~shared/tui-agent/config'
import { getTuiAgentDefaultArgs, getTuiAgentDefaultEnv } from '~shared/tui-agent/launch-defaults'
import { isTuiAgentEnabled, pickTuiAgent } from '~shared/tui-agent/selection'
import {
  buildAgentResumeStartupPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '~shared/tui-agent/startup'
import type { AgentStartupShell } from '~shared/tui-agent/startup-shell'
import type { TuiAgent } from '~shared/types'

import {
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from '../agent-trust-presets'
import type { Store } from '../persistence'
import { detectInstalledAgentsWithShellPathHydration } from '../preflight/preflight'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import {
  getFridayHomePath,
  getLegacyFridayHomePath,
  migrateFridayHomeIfNeeded
} from './home-migration'
import { FRIDAY_IDENTITY, resolveFridayIdentityFileAction } from './identity'

export class FridayService {
  private session: FridaySession | null = null
  private creating: Promise<FridaySession> | null = null
  private disposed = false

  constructor(
    private readonly store: Store,
    private readonly runtime: YiruRuntimeService,
    private readonly userDataPath: string
  ) {}

  async getOrCreate(): Promise<FridaySession> {
    if (this.disposed) {
      throw new Error('Friday is shutting down.')
    }
    let session = this.session
    if (!session || !(await this.isAlive(session))) {
      this.session = null
      session = await this.startCreatingSession('resume')
    }
    return this.revealSession(session)
  }

  async restart(): Promise<FridaySession> {
    if (this.disposed) {
      throw new Error('Friday is shutting down.')
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

  private startCreatingSession(mode: 'resume' | 'fresh'): Promise<FridaySession> {
    if (!this.creating) {
      this.creating = this.createSession(mode).finally(() => {
        this.creating = null
      })
    }
    return this.creating
  }

  private async revealSession(session: FridaySession): Promise<FridaySession> {
    const tabId = await this.runtime.revealFridayChat(session.handle)
    const revealed = tabId === session.tabId ? session : { ...session, tabId }
    this.session = revealed
    return revealed
  }

  private async createSession(mode: 'resume' | 'fresh'): Promise<FridaySession> {
    await migrateFridayHomeIfNeeded(this.userDataPath)
    const fridayHome = getFridayHomePath(this.userDataPath)
    await this.ensureIdentityFiles(fridayHome)
    const agent = await this.resolveAgent()
    this.markWorkspaceTrusted(agent, fridayHome)

    const settings = this.store.getSettings()
    const agentArgs = getTuiAgentDefaultArgs(agent)
    const agentEnv = getTuiAgentDefaultEnv(agent)
    const shell = resolveLocalWindowsAgentStartupShell({
      platform: process.platform,
      isRemote: false,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    // Why: Friday must operate Yiru unattended even when ordinary
    // workspace agents are configured to stop for per-tool approval.
    const startup =
      mode === 'resume'
        ? await this.buildResumeStartup(agent, fridayHome, agentArgs, agentEnv, shell)
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
      throw new Error(`Could not build the ${agent} launch command for Friday.`)
    }

    const terminal = await this.runtime.createTerminal(FRIDAY_WORKTREE_ID, {
      command: effectiveStartup.launchCommand,
      cwd: fridayHome,
      ...(effectiveStartup.env ? { env: effectiveStartup.env } : {}),
      launchConfig: effectiveStartup.launchConfig,
      launchAgent: agent,
      ...(effectiveStartup.startupCommandDelivery
        ? { startupCommandDelivery: effectiveStartup.startupCommandDelivery }
        : {}),
      viewMode: 'chat',
      title: 'Friday',
      presentation: 'background',
      // Why: this PTY exists only for native chat until the user explicitly
      // chooses the raw-terminal escape; mobile/session tab lists stay clean.
      deferMobileSessionPublish: true
    })
    if (!terminal.tabId || !terminal.paneKey || !terminal.ptyId) {
      await this.runtime.closeTerminal(terminal.handle).catch(() => undefined)
      throw new Error('Friday started without a usable terminal identity.')
    }
    return {
      agent,
      handle: terminal.handle,
      paneKey: terminal.paneKey,
      ptyId: terminal.ptyId,
      tabId: terminal.tabId,
      worktreeId: FRIDAY_WORKTREE_ID
    }
  }

  private async buildResumeStartup(
    agent: TuiAgent,
    fridayHome: string,
    agentArgs: string,
    agentEnv: Record<string, string>,
    shell: AgentStartupShell | undefined
  ): Promise<AgentStartupPlan | null> {
    if (!isResumableTuiAgent(agent)) {
      return null
    }
    // Why: providers index their session transcripts by cwd, so a conversation
    // started before the Friday rename is only discoverable under the old home.
    // Drop the legacy path after 2026-11-01.
    const scopePaths = [fridayHome, getLegacyFridayHomePath(this.userDataPath)]
    const result = await this.runtime
      .listAiVaultSessions({ limit: 50, scopePaths })
      .catch(() => null)
    const homeKeys = new Set(scopePaths.map(normalizeRuntimePathForComparison))
    const previous = result?.sessions.find(
      (session) =>
        session.agent === agent &&
        session.cwd !== null &&
        homeKeys.has(normalizeRuntimePathForComparison(session.cwd)) &&
        isAiVaultSessionResumableContent(session)
    )
    if (!previous) {
      return null
    }
    return buildAgentResumeStartupPlan({
      agent,
      providerSession: { key: 'session_id', id: previous.sessionId },
      ompResumeFilePath: previous.filePath,
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
      throw new Error('Choose a native-chat capable default agent before opening Friday.')
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
      throw new Error('Install or enable Claude, OpenClaude, Codex, or Grok to use Friday.')
    }
    return picked
  }

  private async ensureIdentityFiles(fridayHome: string): Promise<void> {
    await mkdir(fridayHome, { recursive: true })
    // Why: both Claude-family and Codex-family agents read their own identity
    // filename, so Friday's identity has to exist under each one.
    await Promise.all([
      writeIdentityFile(join(fridayHome, 'CLAUDE.md')),
      writeIdentityFile(join(fridayHome, 'AGENTS.md'))
    ])
  }

  private markWorkspaceTrusted(agent: TuiAgent, fridayHome: string): void {
    const preset = TUI_AGENT_CONFIG[agent].preflightTrust
    try {
      if (preset === 'cursor') {
        markCursorWorkspaceTrusted(fridayHome)
      } else if (preset === 'copilot') {
        markCopilotFolderTrusted(fridayHome)
      } else if (preset === 'codex') {
        markCodexProjectTrusted(fridayHome)
      }
    } catch {
      // Best-effort: an agent trust prompt is recoverable in raw-terminal mode.
    }
  }

  private async isAlive(session: FridaySession): Promise<boolean> {
    try {
      await this.runtime.getTerminalAgentStatus(session.handle)
      return true
    } catch {
      return false
    }
  }
}

async function readExistingIdentity(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function writeIdentityFile(filePath: string): Promise<void> {
  const existing = await readExistingIdentity(filePath)
  if (resolveFridayIdentityFileAction(existing) === 'keep') {
    return
  }
  await writeFile(filePath, FRIDAY_IDENTITY, { encoding: 'utf8' })
}
