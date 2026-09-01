import type { StarNagPromptMode } from '@yiru/runtime-protocol/workbench/star-nag-telemetry'

import { getShellGitHubService } from '../github/github'
import type { Store } from '../persistence/store'
import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'

export type AgentValueMomentPreparation =
  | { status: 'ready'; mode: StarNagPromptMode }
  | { status: 'skipped' }

type AgentValueMomentActions = {
  isEvaluating: () => boolean
  setEvaluating: (value: boolean) => void
  isPromptVisible: () => boolean
  isCooldownActive: (deferredUntil: number | null | undefined) => boolean
  markCompleted: () => void
  trackAlreadyStarred: () => void
  show: (mode: StarNagPromptMode) => boolean
}

export class StarNagAgentValueMoment {
  private readonly store: Store
  private readonly actions: AgentValueMomentActions
  private pendingMode: StarNagPromptMode | null = null

  constructor(store: Store, actions: AgentValueMomentActions) {
    this.store = store
    this.actions = actions
  }

  async prepare(): Promise<AgentValueMomentPreparation> {
    if (this.wasConsumed() || this.actions.isEvaluating()) {
      return { status: 'skipped' }
    }
    const ui = this.store.getUI()
    if (
      ui.starNagCompleted ||
      this.actions.isCooldownActive(ui.starNagDeferredUntil) ||
      this.actions.isPromptVisible()
    ) {
      this.consumeVersion()
      return { status: 'skipped' }
    }
    this.actions.setEvaluating(true)
    try {
      const starred = await getShellGitHubService().checkYiruStarred()
      if (this.store.getUI().starNagCompleted) {
        return { status: 'skipped' }
      }
      if (starred === null) {
        this.pendingMode = 'web'
        return { status: 'ready', mode: 'web' }
      }
      if (starred) {
        this.actions.trackAlreadyStarred()
        this.actions.markCompleted()
        this.consumeVersion()
        return { status: 'skipped' }
      }
      this.pendingMode = 'gh'
      return { status: 'ready', mode: 'gh' }
    } finally {
      this.actions.setEvaluating(false)
    }
  }

  showPrepared(): void {
    const mode = this.pendingMode
    if (!mode || this.wasConsumed()) {
      return
    }
    const ui = this.store.getUI()
    if (
      ui.starNagCompleted ||
      this.actions.isCooldownActive(ui.starNagDeferredUntil) ||
      this.actions.isPromptVisible() ||
      this.actions.isEvaluating()
    ) {
      this.consumeVersion()
      this.pendingMode = null
      return
    }
    const delivered = this.actions.show(mode)
    if (delivered || this.store.getUI().starNagCompleted) {
      this.consumeVersion()
    }
    if (delivered) {
      this.pendingMode = null
    }
  }

  clear(): void {
    this.pendingMode = null
  }

  private consumeVersion(): void {
    this.store.updateUI({
      starNagAgentValueMomentAppVersion: getRuntimeHostPathsProvider().version()
    })
  }

  private wasConsumed(): boolean {
    return (
      this.store.getUI().starNagAgentValueMomentAppVersion ===
      getRuntimeHostPathsProvider().version()
    )
  }
}
