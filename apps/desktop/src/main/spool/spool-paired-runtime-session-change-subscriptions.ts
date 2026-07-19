import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import {
  SpoolPairedRuntimeSessionChangedEventSchema,
  SpoolPairedRuntimeSubscribeSessionChangesParamsSchema
} from '../../shared/spool/spool-paired-runtime-session-contract'
import { subscribeRuntimeEnvironmentRetainedExistingRoute } from '../ipc/runtime-environment-existing-route'
import type {
  SpoolExecutionHostSessionReadRequest,
  SpoolMobileSessionTabsResult,
  SpoolObservedProviderSession
} from './spool-session-source'

type SessionChangesBinding = {
  environmentId: string
  targetIdentity: string
  request: SpoolExecutionHostSessionReadRequest
  subscription: RemoteRuntimeSubscription | null
  refresh: Promise<void> | null
  refreshQueued: boolean
  retryAttempt: number
  retryTimer: ReturnType<typeof setTimeout> | null
  recovering: boolean
}

type SessionChangeEvent = Parameters<
  Parameters<typeof subscribeRuntimeEnvironmentRetainedExistingRoute>[4]['onEvent']
>[0]

const SESSION_CHANGE_RETRY_BASE_MS = 500
const SESSION_CHANGE_RETRY_MAX_MS = 15_000

/** Owns paired-runtime invalidation streams and coalesces their live-session refreshes. */
export class SpoolPairedRuntimeSessionChangeSubscriptions {
  private readonly listeners = new Set<
    (
      snapshot?: SpoolMobileSessionTabsResult,
      request?: SpoolExecutionHostSessionReadRequest,
      providerSessions?: readonly SpoolObservedProviderSession[]
    ) => void
  >()
  private readonly bindings = new Map<string, SessionChangesBinding>()

  constructor(
    private readonly userDataPath: string,
    private readonly refreshSnapshot: (
      request: SpoolExecutionHostSessionReadRequest
    ) => Promise<SpoolMobileSessionTabsResult | null | undefined>
  ) {}

  subscribe(
    listener: (
      snapshot?: SpoolMobileSessionTabsResult,
      request?: SpoolExecutionHostSessionReadRequest,
      providerSessions?: readonly SpoolObservedProviderSession[]
    ) => void
  ): () => void {
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) {
        return
      }
      subscribed = false
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.closeAll()
      }
    }
  }

  ensure(environmentId: string, request: SpoolExecutionHostSessionReadRequest): void {
    if (this.listeners.size === 0) {
      return
    }
    const bindingKey = JSON.stringify([environmentId, request.worktreeId])
    const targetIdentity = sessionTargetIdentity(request)
    const existing = this.bindings.get(bindingKey)
    if (existing?.targetIdentity === targetIdentity) {
      existing.request = request
      return
    }
    if (existing) {
      this.close(bindingKey, existing)
    }
    const binding: SessionChangesBinding = {
      environmentId,
      targetIdentity,
      request,
      subscription: null,
      refresh: null,
      refreshQueued: false,
      retryAttempt: 0,
      retryTimer: null,
      recovering: false
    }
    this.bindings.set(bindingKey, binding)
    this.open(bindingKey, binding)
  }

  forget(environmentId: string, request: SpoolExecutionHostSessionReadRequest): void {
    const bindingKey = JSON.stringify([environmentId, request.worktreeId])
    const binding = this.bindings.get(bindingKey)
    if (binding?.targetIdentity === sessionTargetIdentity(request)) {
      this.close(bindingKey, binding)
    }
  }

  private open(bindingKey: string, binding: SessionChangesBinding): void {
    if (this.bindings.get(bindingKey) !== binding || this.listeners.size === 0) {
      return
    }
    const params = SpoolPairedRuntimeSubscribeSessionChangesParamsSchema.parse({
      target: pairedRuntimeSessionTarget(binding.request)
    })
    // Why: Public-worktree observation is owner policy and may retain an already-ready host route.
    void subscribeRuntimeEnvironmentRetainedExistingRoute(
      this.userDataPath,
      binding.environmentId,
      'spool.host.subscribeSessionChanges',
      params,
      {
        onEvent: (event) => this.handleEvent(bindingKey, binding, event),
        onClose: () => this.fail(bindingKey, binding)
      }
    )
      .then((subscription) => {
        if (this.bindings.get(bindingKey) !== binding || binding.recovering) {
          subscription.close()
          return
        }
        binding.subscription = subscription
      })
      .catch(() => this.fail(bindingKey, binding))
  }

  private handleEvent(
    bindingKey: string,
    binding: SessionChangesBinding,
    event: SessionChangeEvent
  ): void {
    if (this.bindings.get(bindingKey) !== binding) {
      return
    }
    if (event.type !== 'response' || !event.response.ok) {
      this.fail(bindingKey, binding)
      return
    }
    const changed = SpoolPairedRuntimeSessionChangedEventSchema.safeParse(event.response.result)
    if (!changed.success) {
      this.fail(bindingKey, binding)
      return
    }
    // Why: attest the authoritative hook payload before a pull can miss a short-lived agent.
    this.emit(undefined, binding.request, changed.data.providerSessions)
    if (binding.refresh) {
      // Why: one invalidation may arrive while its snapshot is in flight; preserve one trailing read.
      binding.refreshQueued = true
      return
    }
    binding.refresh = this.refresh(bindingKey, binding)
  }

  private async refresh(bindingKey: string, binding: SessionChangesBinding): Promise<void> {
    let snapshot: SpoolMobileSessionTabsResult | undefined
    try {
      snapshot = (await this.refreshSnapshot(binding.request)) ?? undefined
      if (snapshot) {
        // Why: only a completed refresh proves this was more than an immediately closing stream.
        binding.retryAttempt = 0
      }
    } catch {
      // The invalidation still clears stale catalog state when the refresh route is unavailable.
    }
    if (this.bindings.get(bindingKey) === binding) {
      this.emit(snapshot, binding.request)
      if (binding.refreshQueued) {
        binding.refreshQueued = false
        binding.refresh = this.refresh(bindingKey, binding)
      } else {
        binding.refresh = null
      }
    }
  }

  private emit(
    snapshot?: SpoolMobileSessionTabsResult,
    request?: SpoolExecutionHostSessionReadRequest,
    providerSessions?: readonly SpoolObservedProviderSession[]
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot, request, providerSessions)
      } catch {
        // One catalog observer must not prevent the others from refreshing.
      }
    }
  }

  private close(bindingKey: string, binding: SessionChangesBinding): void {
    if (this.bindings.get(bindingKey) !== binding) {
      return
    }
    this.bindings.delete(bindingKey)
    if (binding.retryTimer) {
      clearTimeout(binding.retryTimer)
      binding.retryTimer = null
    }
    const subscription = binding.subscription
    binding.subscription = null
    subscription?.close()
  }

  private fail(bindingKey: string, binding: SessionChangesBinding): void {
    if (this.bindings.get(bindingKey) !== binding || binding.recovering) {
      return
    }
    binding.recovering = true
    const subscription = binding.subscription
    binding.subscription = null
    subscription?.close()
    // Why: clear stale catalog state while this existing paired route reconnects in place.
    this.emit(undefined, binding.request)
    const delay = Math.min(
      SESSION_CHANGE_RETRY_BASE_MS * 2 ** Math.min(binding.retryAttempt, 5),
      SESSION_CHANGE_RETRY_MAX_MS
    )
    binding.retryAttempt = Math.min(binding.retryAttempt + 1, 5)
    binding.retryTimer = setTimeout(() => {
      binding.retryTimer = null
      if (this.bindings.get(bindingKey) !== binding || this.listeners.size === 0) {
        this.close(bindingKey, binding)
        return
      }
      binding.recovering = false
      this.open(bindingKey, binding)
    }, delay)
  }

  private closeAll(): void {
    for (const [bindingKey, binding] of this.bindings) {
      this.close(bindingKey, binding)
    }
  }
}

export function pairedRuntimeSessionTarget(request: SpoolExecutionHostSessionReadRequest) {
  return {
    kind: request.worktreeKind,
    worktreeId: request.worktreeId,
    instanceId: request.worktreeInstanceId,
    spoolIncarnationId: request.spoolIncarnationId
  }
}

function sessionTargetIdentity(request: SpoolExecutionHostSessionReadRequest): string {
  return JSON.stringify([
    request.worktreeKind,
    request.worktreeInstanceId,
    request.spoolIncarnationId
  ])
}
