import {
  hasPendingAgentResultText,
  normalizeHookPayload,
  preparePendingGrokResultDiscovery,
  type AgentHookEventPayload,
  type HookListenerState
} from '~shared/agent/hook-listener'
import type { AgentHookSource } from '~shared/agent/hook-relay'

const RETRY_ATTEMPTS = 5
const RETRY_DELAY_MS = 50

export class AgentHookMessageRetry {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly state: HookListenerState
  private readonly env: string
  private readonly isActive: () => boolean
  private readonly applyEvent: (
    event: AgentHookEventPayload,
    source: AgentHookSource,
    env?: string,
    version?: string
  ) => void

  constructor(args: {
    state: HookListenerState
    env: string
    isActive: () => boolean
    applyEvent: (
      event: AgentHookEventPayload,
      source: AgentHookSource,
      env?: string,
      version?: string
    ) => void
  }) {
    this.state = args.state
    this.env = args.env
    this.isActive = args.isActive
    this.applyEvent = args.applyEvent
  }

  clear(paneKey: string): void {
    const timer = this.timers.get(paneKey)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(paneKey)
    }
  }

  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  schedule(
    source: AgentHookSource,
    body: unknown,
    original: AgentHookEventPayload,
    env?: string,
    version?: string,
    attempt = 1,
    discoveryReady = false
  ): void {
    if (
      original.payload.lastAssistantMessage ||
      !hasPendingAgentResultText(source, body) ||
      attempt > RETRY_ATTEMPTS
    ) {
      return
    }
    this.clear(original.paneKey)
    if (!discoveryReady) {
      const discovery = preparePendingGrokResultDiscovery(source, body)
      if (discovery) {
        // Why: remote discovery can outlive transcript flush timers.
        void discovery
          .then(() => {
            if (this.isActive()) {
              this.applyRetry(source, body, original, env, version, 1, true)
            }
          })
          .catch((error) => {
            process.stderr.write(
              `[relay-hook-server] Grok result discovery failed: ${error instanceof Error ? error.message : String(error)}\n`
            )
          })
        return
      }
    }
    const timer = setTimeout(() => {
      try {
        this.timers.delete(original.paneKey)
        this.applyRetry(source, body, original, env, version, attempt + 1, discoveryReady)
      } catch (error) {
        process.stderr.write(
          `[relay-hook-server] assistant message retry failed: ${error instanceof Error ? error.message : String(error)}\n`
        )
      }
    }, RETRY_DELAY_MS)
    this.timers.set(original.paneKey, timer)
    timer.unref?.()
  }

  private applyRetry(
    source: AgentHookSource,
    body: unknown,
    original: AgentHookEventPayload,
    env: string | undefined,
    version: string | undefined,
    nextAttempt: number,
    requireExactOriginal: boolean
  ): void {
    const current = this.state.lastStatusByPaneKey.get(original.paneKey)
    if (
      !current ||
      (requireExactOriginal && current !== original) ||
      current.payload.agentType !== original.payload.agentType ||
      current.payload.prompt !== original.payload.prompt ||
      current.payload.lastAssistantMessage
    ) {
      return
    }
    const event = normalizeHookPayload(this.state, source, body, this.env)
    if (!event?.payload.lastAssistantMessage) {
      this.schedule(source, body, original, env, version, nextAttempt, requireExactOriginal)
      return
    }
    this.applyEvent(event, source, env, version)
  }
}
