import type {
  ActivateTabInput,
  CreateTerminalTabInput,
  MoveTabInput,
  RuntimeMobileSessionTabsAllStreamEvent,
  RuntimeMobileSessionTabsStreamEvent,
  SaveMarkdownTabInput,
  SessionTabsUnsubscribeAllInput,
  SessionTabsUnsubscribeInput,
  SetTabPropsInput,
  UpdatePaneLayoutInput,
  WorktreeTabSelectorInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'
import { bindSubscriptionAbort } from './subscription-abort'

export function handleSessionTabsList(params: WorktreeTabSelectorInput, { runtime }: RpcContext) {
  return runtime.listMobileSessionTabs(params.worktree)
}

export async function handleSessionTabsListAll(_params: void, { runtime }: RpcContext) {
  return { snapshots: await runtime.listAllMobileSessionTabs() }
}

export function handleSessionTabsActivate(params: ActivateTabInput, { runtime }: RpcContext) {
  return runtime.activateMobileSessionTab(params.worktree, params.tabId, params.leafId, {
    notifyClients: params.notifyClients !== false
  })
}

export function handleSessionTabsClose(params: ActivateTabInput, { runtime }: RpcContext) {
  return runtime.closeMobileSessionTab(params.worktree, params.tabId)
}

export function handleSessionTabsCreateTerminal(
  params: CreateTerminalTabInput,
  { runtime, signal }: RpcContext
) {
  return runtime.createMobileSessionTerminal(params.worktree, {
    afterTabId: params.afterTabId,
    targetGroupId: params.targetGroupId,
    command: params.command,
    cwd: params.cwd,
    ...(params.env ? { env: params.env } : {}),
    ...(params.envToDelete ? { envToDelete: params.envToDelete } : {}),
    startupCommandDelivery: params.startupCommandDelivery,
    agent: params.agent,
    ...(params.agentPrompt !== undefined ? { agentPrompt: params.agentPrompt } : {}),
    ...(params.launchConfig ? { launchConfig: params.launchConfig } : {}),
    ...(params.launchToken ? { launchToken: params.launchToken } : {}),
    ...(params.launchAgent ? { launchAgent: params.launchAgent } : {}),
    activate: params.activate,
    clientMutationId: params.clientMutationId,
    // Why: a dead client connection must cancel the surface wait instead
    // of running down the timeout and rolling back a live tab (#7718).
    signal
  })
}

export function handleSessionTabsMove(params: MoveTabInput, { runtime }: RpcContext) {
  const base = { tabId: params.tabId, targetGroupId: params.targetGroupId }
  if (params.kind === 'reorder') {
    return runtime.moveMobileSessionTab(params.worktree, {
      ...base,
      kind: 'reorder',
      tabOrder: params.tabOrder
    })
  }
  if (params.kind === 'split') {
    return runtime.moveMobileSessionTab(params.worktree, {
      ...base,
      kind: 'split',
      splitDirection: params.splitDirection
    })
  }
  return runtime.moveMobileSessionTab(params.worktree, {
    ...base,
    kind: 'move-to-group',
    index: params.index
  })
}

export function handleSessionTabsUpdatePaneLayout(
  params: UpdatePaneLayoutInput,
  { runtime }: RpcContext
) {
  return runtime.updateMobileSessionPaneLayout(params.worktree, {
    tabId: params.tabId,
    root: params.root,
    expandedLeafId: params.expandedLeafId ?? null,
    titlesByLeafId: params.titlesByLeafId
  })
}

export function handleSessionTabsSetTabProps(params: SetTabPropsInput, { runtime }: RpcContext) {
  return runtime.setMobileSessionTabProps(params.worktree, {
    tabId: params.tabId,
    ...(params.color !== undefined ? { color: params.color } : {}),
    ...(params.isPinned !== undefined ? { isPinned: params.isPinned } : {})
  })
}

// Why: `unsubscribe`/`unsubscribeAll` no longer carry a legacy registration —
// they are unary cleanup companions of the still-pinned `subscribe`/
// `subscribeAll` streams (see session-tabs.ts's own note), and slice 110 gave
// `RpcDispatcher` a fallback into the direct wiring
// (orpc/router-direct/agent-session.ts) for exactly that shape of
// bare-envelope caller.
export async function handleSessionTabsUnsubscribe(
  params: SessionTabsUnsubscribeInput,
  { runtime, connectionId }: RpcContext
) {
  const snapshot = await runtime.listMobileSessionTabs(params.worktree)
  const connection = connectionId ?? 'local'
  if (params.subscriptionId) {
    runtime.cleanupSubscription(
      `session.tabs:${connection}:${snapshot.worktree}:${params.subscriptionId}`
    )
    return { unsubscribed: true as const }
  }
  runtime.cleanupSubscription(`session.tabs:${connection}:${params.worktree}`)
  runtime.cleanupSubscription(`session.tabs:${connection}:${snapshot.worktree}`)
  runtime.cleanupSubscriptionsByPrefix(`session.tabs:${connection}:${snapshot.worktree}:`)
  return { unsubscribed: true as const }
}

export function handleSessionTabsUnsubscribeAll(
  params: SessionTabsUnsubscribeAllInput,
  { runtime, connectionId }: RpcContext
) {
  const cleanupPrefix = `session.tabs:${connectionId ?? 'local'}:*`
  if (params?.subscriptionId) {
    runtime.cleanupSubscription(`${cleanupPrefix}:${params.subscriptionId}`)
    return { unsubscribed: true as const }
  }
  runtime.cleanupSubscription(cleanupPrefix)
  runtime.cleanupSubscriptionsByPrefix(`${cleanupPrefix}:`)
  return { unsubscribed: true as const }
}

export function handleMarkdownReadTab(params: ActivateTabInput, { runtime }: RpcContext) {
  return runtime.readMobileMarkdownTab(params.worktree, params.tabId)
}

export function handleMarkdownSaveTab(params: SaveMarkdownTabInput, { runtime }: RpcContext) {
  return runtime.saveMobileMarkdownTab(
    params.worktree,
    params.tabId,
    params.baseVersion,
    params.content
  )
}

// Why: the direct oRPC router and its subscription lifecycle share this plain
// streaming handler, including AbortSignal cleanup for every client lane.
export async function handleSessionTabsSubscribe(
  params: WorktreeTabSelectorInput,
  { runtime, connectionId, requestId, signal }: RpcContext,
  emit: (event: RuntimeMobileSessionTabsStreamEvent) => void
): Promise<void> {
  let subscribedWorktree: string | null = null
  let unsubscribe = (): void => {}
  let removeAbortListener = (): void => {}
  let resolveSubscription = (): void => {}
  const subscriptionClosed = new Promise<void>((resolve) => {
    resolveSubscription = resolve
  })
  let closed = false
  let initialized = false
  if (signal?.aborted) {
    return
  }
  const initial = await runtime.listMobileSessionTabs(params.worktree)
  if (signal?.aborted) {
    return
  }
  subscribedWorktree = initial.worktree
  const cleanupPrefix = `session.tabs:${connectionId ?? 'local'}:${subscribedWorktree}`
  const subscriptionId = requestId ? `${cleanupPrefix}:${requestId}` : cleanupPrefix
  // Why: shared-control can carry multiple subscribers for one worktree on
  // one socket; include the RPC id so one subscriber cannot evict another.
  runtime.registerSubscriptionCleanup(
    subscriptionId,
    () => {
      if (closed) {
        return
      }
      closed = true
      removeAbortListener()
      unsubscribe()
      if (initialized) {
        emit({ type: 'end' })
      }
      resolveSubscription()
    },
    connectionId
  )
  removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
  if (closed) {
    return
  }
  emit({ type: 'snapshot', ...initial })
  initialized = true
  if (closed) {
    return
  }
  unsubscribe = runtime.onMobileSessionTabsChanged((snapshot) => {
    if (snapshot.worktree === subscribedWorktree) {
      emit({ type: 'updated', ...snapshot })
    }
  })
  if (closed) {
    unsubscribe()
  }
  await subscriptionClosed
}

// Why: see handleSessionTabsSubscribe — same dual-registration reasoning
// (plain export shared by the direct wiring and the legacy stream that must
// stay registered).
export async function handleSessionTabsSubscribeAll(
  _params: void,
  { runtime, connectionId, requestId, signal }: RpcContext,
  emit: (event: RuntimeMobileSessionTabsAllStreamEvent) => void
): Promise<void> {
  let unsubscribe = (): void => {}
  let removeAbortListener = (): void => {}
  let resolveSubscription = (): void => {}
  const subscriptionClosed = new Promise<void>((resolve) => {
    resolveSubscription = resolve
  })
  let closed = false
  // Why: initial listAll errors should return one RPC error, not a leaked
  // subscription cleanup that later emits a stray end frame.
  let initialized = false
  const cleanupPrefix = `session.tabs:${connectionId ?? 'local'}:*`
  const subscriptionId = requestId ? `${cleanupPrefix}:${requestId}` : cleanupPrefix
  // Why: shared-control can carry multiple all-tab subscribers on one
  // socket; include the RPC id so closing one does not evict siblings.
  runtime.registerSubscriptionCleanup(
    subscriptionId,
    () => {
      if (closed) {
        return
      }
      closed = true
      removeAbortListener()
      unsubscribe()
      if (initialized) {
        emit({ type: 'end' })
      }
      resolveSubscription()
    },
    connectionId
  )
  removeAbortListener = bindSubscriptionAbort(runtime, subscriptionId, signal)
  if (closed) {
    return
  }
  const snapshots = await Promise.resolve(runtime.listAllMobileSessionTabs()).catch((error) => {
    runtime.cleanupSubscription(subscriptionId)
    throw error
  })
  if (closed) {
    return
  }
  emit({ type: 'snapshots', snapshots })
  initialized = true
  if (closed) {
    return
  }
  unsubscribe = runtime.onMobileSessionTabsChanged((snapshot) => {
    emit({ type: 'updated', ...snapshot })
  })
  if (closed) {
    unsubscribe()
  }
  await subscriptionClosed
}
