import { STAR_NAG_INITIAL_THRESHOLD } from '@yiru/runtime-protocol/workbench/constants'
import type {
  StarNagOutcome,
  StarNagPromptMode,
  StarNagPromptSource
} from '@yiru/runtime-protocol/workbench/star-nag-telemetry'

import { getShellGitHubService } from '../github/github'
import type { Store } from '../persistence/store'
import type { StatsCollector } from '../stats/collector'
import { StarNagAgentValueMoment } from './agent-value-moment'
import {
  createStarNagPromptSession,
  ensureStarNagBaseline,
  hasReachedStarNagThreshold,
  logStarNagEvent,
  trackAlreadyStarred,
  trackStarNagOutcome,
  type StarNagPromptSession
} from './prompt'

const STAR_NAG_COOLDOWN_DAYS = 3
const STAR_NAG_COOLDOWN_MS = STAR_NAG_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

type StarNagEvent =
  | { type: 'starNagShow'; mode: StarNagPromptMode; surface: 'card' | 'toast' }
  | { type: 'starNagHide' }

type StarNagServiceOptions = {
  store: Store
  stats: StatsCollector
  hasAudience: () => boolean
  publish: (event: StarNagEvent) => void
}

export class StarNagService {
  private readonly options: StarNagServiceOptions
  private promptVisible = false
  private evaluating = false
  private pendingForceShow = false
  private pendingOnboardingCompleted = false
  private promptSession: StarNagPromptSession | null = null
  private readonly agentValueMoment: StarNagAgentValueMoment

  constructor(options: StarNagServiceOptions) {
    this.options = options
    this.agentValueMoment = new StarNagAgentValueMoment(options.store, {
      isEvaluating: () => this.evaluating,
      setEvaluating: (value) => this.setEvaluating(value),
      isPromptVisible: () => this.promptVisible,
      isCooldownActive: (deferredUntil) => this.isCooldownActive(deferredUntil),
      markCompleted: () => this.markCompleted(),
      trackAlreadyStarred: () =>
        trackAlreadyStarred(options.store, options.stats, 'agent_value_moment'),
      show: (mode) => this.show('agent_value_moment', mode, 'card')
    })
  }

  start(): void {
    ensureStarNagBaseline(this.options.store, this.options.stats)
    this.options.stats.onAgentStarted((total) => this.handleAgentStarted(total))
  }

  dismiss(): void {
    this.defer('dismissed')
  }

  later(): void {
    this.defer('later')
  }

  complete(): void {
    this.markCompleted()
  }

  disable(): void {
    this.trackOutcome('disabled')
    this.markCompleted()
  }

  openWeb(): void {
    const session = this.promptSession
    if (!session || session.openedRepoTracked) {
      return
    }
    session.openedRepoTracked = true
    trackStarNagOutcome(session, 'opened_repo', { mode: 'web' })
    this.deferState()
    this.clearPrompt(true)
  }

  async starYiru(): Promise<boolean> {
    const session = this.promptSession
    if (!session) {
      return false
    }
    if (session.starAttemptPromise) {
      return session.starAttemptPromise
    }
    const attempt = this.runStarAttempt(session)
    session.starAttemptPromise = attempt
    try {
      return await attempt
    } finally {
      if (this.promptSession === session) {
        delete session.starAttemptPromise
      }
    }
  }

  forceShow(): void {
    if (this.promptVisible) {
      return
    }
    if (this.evaluating) {
      this.pendingForceShow = true
      return
    }
    this.show('force_show', 'gh', 'card')
  }

  agentValueMomentPreparation() {
    return this.agentValueMoment.prepare()
  }

  showAgentValueMoment(): void {
    this.agentValueMoment.showPrepared()
  }

  async onboardingCompleted(): Promise<void> {
    const ui = this.options.store.getUI()
    const cooldownActive = this.isCooldownActive(ui.starNagDeferredUntil)
    if (ui.starNagCompleted || cooldownActive || this.evaluating) {
      if (!ui.starNagCompleted && !cooldownActive && this.evaluating) {
        this.pendingOnboardingCompleted = true
      }
      return
    }
    if (this.promptVisible) {
      this.clearPrompt(true)
    }
    await this.maybeShow('onboarding_completed', 'toast')
  }

  private handleAgentStarted(total: number): void {
    const ui = this.options.store.getUI()
    if (
      this.promptVisible ||
      this.evaluating ||
      ui.starNagCompleted ||
      this.isCooldownActive(ui.starNagDeferredUntil) ||
      !hasReachedStarNagThreshold(this.options.store, this.options.stats, total)
    ) {
      return
    }
    void this.maybeShow('threshold', 'card')
  }

  private async maybeShow(
    source: StarNagPromptSource,
    surface: 'card' | 'toast'
  ): Promise<boolean> {
    if (this.promptVisible || this.evaluating) {
      return false
    }
    this.setEvaluating(true)
    try {
      const starred = await getShellGitHubService().checkYiruStarred()
      if (this.options.store.getUI().starNagCompleted) {
        this.pendingForceShow = false
        return false
      }
      if (starred === null) {
        return this.show(source, 'web', surface)
      }
      if (starred) {
        trackAlreadyStarred(this.options.store, this.options.stats, source)
        this.markCompleted()
        return false
      }
      return this.show(source, 'gh', surface)
    } finally {
      this.setEvaluating(false)
      this.flushPendingForceShow()
    }
  }

  private show(
    source: StarNagPromptSource,
    mode: StarNagPromptMode,
    surface: 'card' | 'toast'
  ): boolean {
    if (!this.options.hasAudience() || this.promptVisible) {
      return false
    }
    const session = createStarNagPromptSession(this.options.store, this.options.stats, source, mode)
    this.options.publish({ type: 'starNagShow', mode, surface })
    this.promptVisible = true
    this.promptSession = session
    this.trackOutcome('shown')
    logStarNagEvent(this.options.store, this.options.stats, 'star_nag_shown', source)
    return true
  }

  private defer(outcome: Extract<StarNagOutcome, 'dismissed' | 'later'>): void {
    const session = this.promptSession
    if (!session) {
      this.promptVisible = false
      return
    }
    const threshold = this.options.store.getUI().starNagNextThreshold ?? STAR_NAG_INITIAL_THRESHOLD
    const nextThreshold = threshold * 2
    this.trackOutcome(outcome, { nextThreshold, cooldownDays: STAR_NAG_COOLDOWN_DAYS })
    logStarNagEvent(
      this.options.store,
      this.options.stats,
      outcome === 'later' ? 'star_nag_later' : 'star_nag_dismissed',
      session.source,
      nextThreshold
    )
    this.deferState()
    this.clearPrompt(true)
  }

  private deferState(): void {
    const threshold = this.options.store.getUI().starNagNextThreshold ?? STAR_NAG_INITIAL_THRESHOLD
    this.options.store.updateUI({
      starNagNextThreshold: threshold * 2,
      starNagBaselineAgents: this.options.stats.getTotalAgentsSpawned(),
      starNagDeferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS
    })
  }

  private async runStarAttempt(session: StarNagPromptSession): Promise<boolean> {
    trackStarNagOutcome(session, 'star_clicked', { mode: 'gh' })
    const source =
      session.source === 'agent_value_moment' || session.source === 'onboarding_completed'
        ? session.source
        : 'star_nag'
    const starred = await getShellGitHubService().starYiru(source)
    if (!starred) {
      trackStarNagOutcome(session, 'direct_star_failed', { mode: 'gh' })
      session.mode = 'web'
      return false
    }
    trackStarNagOutcome(session, 'direct_star_succeeded', { mode: 'gh' })
    this.markCompleted()
    return true
  }

  private markCompleted(): void {
    this.options.store.updateUI({ starNagCompleted: true, starNagDeferredUntil: null })
    this.clearPrompt(true)
    this.pendingForceShow = false
    this.pendingOnboardingCompleted = false
  }

  private clearPrompt(publishHide = false): void {
    const wasVisible = this.promptVisible
    this.promptVisible = false
    this.promptSession = null
    this.agentValueMoment.clear()
    if (publishHide && wasVisible) {
      this.options.publish({ type: 'starNagHide' })
    }
  }

  private trackOutcome(
    outcome: StarNagOutcome,
    options?: { mode?: StarNagPromptMode; nextThreshold?: number; cooldownDays?: number }
  ): void {
    if (this.promptSession) {
      trackStarNagOutcome(this.promptSession, outcome, options)
    }
  }

  private setEvaluating(value: boolean): void {
    this.evaluating = value
    if (!value && this.pendingOnboardingCompleted) {
      this.pendingOnboardingCompleted = false
      void this.onboardingCompleted()
    }
  }

  private flushPendingForceShow(): void {
    if (this.pendingForceShow && !this.evaluating) {
      this.pendingForceShow = false
      this.show('force_show', 'gh', 'card')
    }
  }

  private isCooldownActive(deferredUntil: number | null | undefined): boolean {
    return typeof deferredUntil === 'number' && deferredUntil > Date.now()
  }
}
