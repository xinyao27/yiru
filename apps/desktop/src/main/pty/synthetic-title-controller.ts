import type { AgentStatusState } from '@yiru/workbench-model/agent'
import type { BrowserWindow } from 'electron'
import type { SyntheticAgentTitleProfile } from '~shared/synthetic-agent-title'
import { resolveTuiAgentPermissionMode } from '~shared/tui-agent/permissions'

import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import {
  advanceSyntheticTitleSpinnerEntries,
  type SyntheticTitleSpinnerEntry
} from '../synthetic-title-spinner'
import { shouldSendSyntheticTitleFrame } from '../synthetic-title-visibility'
import { getPtyIdForPaneKey, registerPaneKeyTeardownListener } from './pty'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL_MS = 80

export class SyntheticTitleController {
  readonly #getWindow: () => BrowserWindow | null
  readonly #getRuntime: () => YiruRuntimeService | null
  readonly #spinners = new Map<string, SyntheticTitleSpinnerEntry<SyntheticAgentTitleProfile>>()
  #timer: ReturnType<typeof setInterval> | null = null

  constructor(options: {
    getWindow: () => BrowserWindow | null
    getRuntime: () => YiruRuntimeService | null
  }) {
    this.#getWindow = options.getWindow
    this.#getRuntime = options.getRuntime
    registerPaneKeyTeardownListener((paneKey) => this.#stopSpinner(paneKey))
  }

  driveFromHook(
    paneKey: string,
    state: AgentStatusState,
    profile: SyntheticAgentTitleProfile
  ): void {
    const ptyId = getPtyIdForPaneKey(paneKey)
    if (!ptyId) {
      return
    }
    if (state === 'working') {
      const existing = this.#spinners.get(paneKey)
      const frame = existing ? existing.frame : 0
      this.#send(ptyId, `\x1b]0;${SPINNER_FRAMES[frame]} ${profile.workingLabel}\x07`)
      if (existing) {
        existing.profile = profile
        return
      }
      this.#spinners.set(paneKey, { frame, profile })
      this.#ensureTimer()
      return
    }

    this.#stopSpinner(paneKey)
    const needsUserInput = state === 'blocked' || state === 'waiting'
    const label = needsUserInput ? profile.permissionLabel : profile.idleLabel
    this.#send(ptyId, `\x1b]0;${label}\x07${needsUserInput ? '\x07' : ''}`, { force: true })
  }

  resume(): void {
    this.#ensureTimer()
  }

  stopTimer(): void {
    if (this.#timer) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  stopAll(): void {
    this.#spinners.clear()
    this.stopTimer()
  }

  #isWindowVisible(): boolean {
    const window = this.#getWindow()
    return Boolean(window && !window.isDestroyed() && window.isVisible() && !window.isMinimized())
  }

  #canSendDecorativeFrame(): boolean {
    return shouldSendSyntheticTitleFrame({
      force: false,
      windowVisible: this.#isWindowVisible()
    })
  }

  #send(ptyId: string, data: string, options: { force?: boolean } = {}): void {
    const window = this.#getWindow()
    if (
      !window ||
      window.isDestroyed() ||
      !shouldSendSyntheticTitleFrame({
        force: options.force === true,
        windowVisible: this.#isWindowVisible()
      })
    ) {
      return
    }
    this.#getRuntime()?.ingestSyntheticTitleFrame(ptyId, data)
  }

  #stopSpinner(paneKey: string): void {
    if (this.#spinners.delete(paneKey) && this.#spinners.size === 0) {
      this.stopTimer()
    }
  }

  #tick(): void {
    if (!this.#canSendDecorativeFrame()) {
      this.stopTimer()
      return
    }
    const ticks = advanceSyntheticTitleSpinnerEntries({
      entries: this.#spinners,
      frameCount: SPINNER_FRAMES.length,
      getPtyIdForPaneKey
    })
    for (const tick of ticks) {
      this.#send(
        tick.ptyId,
        `\x1b]0;${SPINNER_FRAMES[tick.frame]} ${tick.profile.workingLabel}\x07`
      )
    }
    if (this.#spinners.size === 0) {
      this.stopTimer()
    }
  }

  #ensureTimer(): void {
    if (this.#timer || this.#spinners.size === 0 || !this.#canSendDecorativeFrame()) {
      return
    }
    this.#timer = setInterval(() => this.#tick(), SPINNER_INTERVAL_MS)
  }
}

export function shouldSuppressCodexAutoApprovalSyntheticTitle(args: {
  agentType: string | null | undefined
  state: AgentStatusState
  launchConfig:
    | {
        agentArgs?: string | null
        agentEnv?: Record<string, string> | null
      }
    | null
    | undefined
}): boolean {
  if (args.agentType !== 'codex' || (args.state !== 'waiting' && args.state !== 'blocked')) {
    return false
  }
  return Boolean(
    args.launchConfig &&
    resolveTuiAgentPermissionMode({
      agent: 'codex',
      agentArgs: args.launchConfig.agentArgs,
      agentEnv: args.launchConfig.agentEnv
    }) === 'yolo'
  )
}
