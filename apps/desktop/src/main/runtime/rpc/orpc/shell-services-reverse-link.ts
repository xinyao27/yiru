import type { shellServicesContract } from '@yiru/runtime-protocol/contract'
import type {
  ContractRouterClient,
  RateLimitResumeSchedule,
  ShellServicesOpenExternalInput,
  ShellServicesOpenExternalOutput,
  ShellServicesAutomationDispatchInput,
  ShellServicesAutomationDispatchResult,
  ShellServicesMobileMarkdownReadInput,
  ShellServicesMobileMarkdownReadResult,
  ShellServicesMobileMarkdownSaveInput,
  ShellServicesMobileMarkdownSaveResult,
  ShellServicesRateLimitResumeDispatchResult,
  ShellServicesTerminalCloseTabInput,
  ShellServicesTerminalCloseTabResult,
  ShellServicesTerminalCreateInput,
  ShellServicesTerminalCreateResult,
  ShellServicesTerminalMountInput,
  ShellServicesTerminalMountResult,
  ShellServicesTerminalRevealInput,
  ShellServicesTerminalRevealResult,
  ShellServicesUICommandInput
} from '@yiru/runtime-protocol/contract'

import {
  electronShellServicesConnectionId,
  type ShellServicesConnectionId
} from './shell-services-identity'

export type ShellServicesClient = ContractRouterClient<typeof shellServicesContract>

export type ShellServicesConnection = {
  client: ShellServicesClient
  close: () => void
}

export type ShellServicesConnectionLifecycleEvent =
  | { type: 'connected'; shellConnectionId: ShellServicesConnectionId }
  | { type: 'disconnected'; shellConnectionId: ShellServicesConnectionId }

type ShellServicesConnectionLifecycleListener = (
  event: ShellServicesConnectionLifecycleEvent
) => void

// Why: Electron renderers and authenticated web clients share this registry.
// Prefixing their transport-native ids gives runtime handlers one shell identity
// without making WebContents the abstraction or allowing the two id spaces to collide.
const connectionsByShellId = new Map<ShellServicesConnectionId, ShellServicesConnection>()
const connectionLifecycleListeners = new Set<ShellServicesConnectionLifecycleListener>()

function emitShellServicesConnectionLifecycle(event: ShellServicesConnectionLifecycleEvent): void {
  for (const listener of connectionLifecycleListeners) {
    listener(event)
  }
}

export function subscribeShellServicesConnectionLifecycle(
  listener: ShellServicesConnectionLifecycleListener
): () => void {
  connectionLifecycleListeners.add(listener)
  return () => connectionLifecycleListeners.delete(listener)
}

export function replaceShellServicesConnection(
  shellConnectionId: ShellServicesConnectionId,
  connection: ShellServicesConnection
): void {
  connectionsByShellId.get(shellConnectionId)?.close()
  connectionsByShellId.set(shellConnectionId, connection)
  emitShellServicesConnectionLifecycle({ type: 'connected', shellConnectionId })
}

export function removeShellServicesConnection(
  shellConnectionId: ShellServicesConnectionId,
  connection: ShellServicesConnection
): void {
  if (connectionsByShellId.get(shellConnectionId) === connection) {
    connectionsByShellId.delete(shellConnectionId)
    emitShellServicesConnectionLifecycle({ type: 'disconnected', shellConnectionId })
  }
}

export function getConnectedShellServicesClient(
  shellConnectionId: ShellServicesConnectionId | undefined
): ShellServicesClient | null {
  if (shellConnectionId === undefined) {
    return null
  }
  return connectionsByShellId.get(shellConnectionId)?.client ?? null
}

export function getConnectedElectronShellServicesClient(
  webContentsId: number | undefined
): ShellServicesClient | null {
  if (webContentsId === undefined) {
    return null
  }
  return getConnectedShellServicesClient(electronShellServicesConnectionId(webContentsId))
}

// Why: these renderer-state commands preserve the old notifier's
// fire-and-forget semantics. Registry lookup still happens by opaque shell
// connection id, so runtime capability code never retains WebContents.
export function dispatchShellUICommand(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesUICommandInput
): boolean {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return false
  }
  void client.ui.command(input).catch(() => undefined)
  return true
}

// Why: worktree sleep owns renderer state and PTY teardown, so the runtime must
// not acknowledge a mobile sleep request until the attached shell has finished
// the ordered browser/terminal shutdown. Other UI commands intentionally keep
// the fire-and-forget notifier semantics above.
export async function requestShellSleepWorktree(
  shellConnectionId: ShellServicesConnectionId | undefined,
  worktreeId: string
): Promise<boolean> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return false
  }
  const output = await client.ui.command(
    { type: 'sleepWorktree', worktreeId },
    { signal: AbortSignal.timeout(30_000) }
  )
  return output.accepted
}

export async function requestShellOpenExternal(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesOpenExternalInput
): Promise<ShellServicesOpenExternalOutput> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { opened: false }
  }
  try {
    return await client.platform.openExternal(input, {
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    return { opened: false }
  }
}

function getElectronShellServicesConnection(
  webContentsId: number | undefined
): ShellServicesConnection | undefined {
  return webContentsId === undefined
    ? undefined
    : connectionsByShellId.get(electronShellServicesConnectionId(webContentsId))
}

// Why: replaces terminal-tab-close-request-relay.ts's 20s `setTimeout`
// (Phase 5 slice S4b). Unlike ping/notifications above, a thrown error here
// (pin rejection, mid-close persistence failure) is not collapsed into
// `shell-unavailable` — it is the caller's real answer and must propagate so
// `closeMobileSessionTab`'s branching on the specific message keeps working.
export async function requestShellTerminalCloseTab(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesTerminalCloseTabInput
): Promise<ShellServicesTerminalCloseTabResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.terminal.closeTab(input, {
    signal: AbortSignal.timeout(20_000)
  })
  return { ok: true, ...output }
}

// Why: Phase 5 slice S4b (terminal creation cluster) — replaces the
// `randomUUID()` + `ipcMain.on('terminal:tabCreateReply', …)` + 10s
// `setTimeout` relay inlined in `createTerminal()`'s foreground path and
// `runCreateMobileSessionTerminal`. Preserves the mobile path's client-abort
// cancellation (#7718): a caller-supplied `signal` is combined with the
// timeout via `AbortSignal.any`, and an abort from that caller signal is
// normalized to the exact `client_disconnected` message
// `isClientDisconnectedError` pattern-matches on, same sentinel the hand-
// rolled relay used. A plain timeout keeps its own message so callers that
// surface `error.message` to the user see the same text as before. Any other
// thrown error (e.g. "No active worktree") is the caller's real answer, not a
// shell-unavailable degrade — same non-collapsing rule as closeTab above.
export async function requestShellTerminalCreate(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesTerminalCreateInput,
  options: { signal?: AbortSignal } = {}
): Promise<ShellServicesTerminalCreateResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const timeoutSignal = AbortSignal.timeout(10_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal
  try {
    const output = await client.terminal.create(input, { signal })
    return { ok: true, ...output }
  } catch (error) {
    if (options.signal?.aborted) {
      throw new Error('client_disconnected')
    }
    if (timeoutSignal.aborted) {
      throw new Error('Terminal creation timed out')
    }
    throw error
  }
}

export async function requestShellTerminalMount(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesTerminalMountInput
): Promise<ShellServicesTerminalMountResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.terminal.mount(input, { signal: AbortSignal.timeout(10_000) })
  return { ok: true, ...output }
}

// Why: Phase 5 slice S4b (terminal creation cluster) — replaces
// `notifier.revealTerminalSession`'s inlined `randomUUID()` +
// `ipcMain.on('terminal:tabCreateReply', …)` + 10s `setTimeout` relay. Unlike
// `create` above, this leg has no caller-supplied abort signal (the hand-
// rolled version never had one either) — only the timeout can fire.
export async function requestShellTerminalReveal(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesTerminalRevealInput
): Promise<ShellServicesTerminalRevealResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const signal = AbortSignal.timeout(10_000)
  try {
    const output = await client.terminal.reveal(input, { signal })
    return { ok: true, ...output }
  } catch (error) {
    if (signal.aborted) {
      throw new Error('Terminal reveal timed out')
    }
    throw error
  }
}

// Why: Phase 5 slice S4a — replaces mobile-markdown-request-relay.ts's
// `randomUUID()` + `ipcMain.on('ui:mobileMarkdownResponse', …)` + 20s
// `setTimeout` (same 20s budget preserved as the AbortSignal below). Same
// non-collapsing rule as requestShellTerminalCloseTab above: a thrown domain
// error (`conflict`, `file_too_large`, `tab_not_found`, …) is the caller's
// real answer, not a shell-unavailable degrade.
export async function readMobileMarkdownViaShell(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesMobileMarkdownReadInput
): Promise<ShellServicesMobileMarkdownReadResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.mobileMarkdown.read(input, {
    signal: AbortSignal.timeout(20_000)
  })
  return { ok: true, ...output }
}

export async function saveMobileMarkdownViaShell(
  shellConnectionId: ShellServicesConnectionId | undefined,
  input: ShellServicesMobileMarkdownSaveInput
): Promise<ShellServicesMobileMarkdownSaveResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  const output = await client.mobileMarkdown.save(input, {
    signal: AbortSignal.timeout(20_000)
  })
  return { ok: true, ...output }
}

// Why: Phase 5 slice S6 (切片 47) — replaces browser-tab.ts's inlined
// `randomUUID()` + `ipcMain.on('browser:tabCreateReply', …)` + 10s
// `setTimeout` relay. `webContentsId` here is the authoritative window's id
// (resolved by the caller via the host's non-throwing window getter), not a
// request-scoped shell connection id — the CLI/mobile caller asking for a tab has
// no webContents of its own; it is asking the runtime to act on the one
// desktop window it manages. Same non-collapsing rule as closeTab/create
// above: a thrown domain error ("No active worktree", the remote-runtime-
// active guard) is the caller's real answer, not a shell-unavailable degrade.
// Why: Phase 5 slice S5 — unlike every reverse call above, the caller here is
// AutomationService's own scheduler tick, not a forward RPC handler, so there
// is no RpcContext to read a `shellConnectionId` from. The service instead
// passes the id of the single webContents it was handed via `setWebContents`.
// `dispatch` only has to be accepted quickly — the renderer keeps running the
// actual launch in the background and reports outcomes through the existing
// local `markDispatchResult` IPC, not through this link.
export async function requestShellAutomationDispatch(
  webContentsId: number,
  input: ShellServicesAutomationDispatchInput
): Promise<ShellServicesAutomationDispatchResult> {
  const connection = getElectronShellServicesConnection(webContentsId)
  if (!connection) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  try {
    const output = await connection.client.automations.dispatch(input)
    return { ok: true, ...output }
  } catch {
    return { ok: false, reason: 'shell-unavailable' }
  }
}

// Why: scheduled dispatch has no active forward request, so the service keeps
// the transport-neutral reverse-link identity of its ready renderer.
export async function requestShellRateLimitResumeDispatch(
  shellConnectionId: ShellServicesConnectionId,
  input: RateLimitResumeSchedule
): Promise<ShellServicesRateLimitResumeDispatchResult> {
  const client = getConnectedShellServicesClient(shellConnectionId)
  if (!client) {
    return { ok: false, reason: 'shell-unavailable' }
  }
  try {
    const output = await client.rateLimitResume.dispatch(input)
    return { ok: true, ...output }
  } catch {
    return { ok: false, reason: 'shell-unavailable' }
  }
}
