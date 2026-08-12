export type RelayAttachment =
  | { role: 'pending'; connectedAt: number }
  | { role: 'machine'; runtimePublicKeyB64: string }
  | { role: 'browser'; browserId: string; connectionId: string }

const PENDING_AUTH_TIMEOUT_MS = 10_000
const MAX_PENDING_SOCKETS = 16
const pendingTimeouts = new WeakMap<WebSocket, ReturnType<typeof setTimeout>>()

export async function acceptPendingRelaySocket(state: DurableObjectState): Promise<Response> {
  const pendingCount = state
    .getWebSockets()
    .filter((socket) => relayAttachment(socket)?.role === 'pending').length
  if (pendingCount >= MAX_PENDING_SOCKETS) {
    return new Response(null, { status: 429 })
  }
  const pair = new WebSocketPair()
  const client = pair[0]
  const server = pair[1]
  const connectedAt = Date.now()
  server.serializeAttachment({ role: 'pending', connectedAt } satisfies RelayAttachment)
  state.acceptWebSocket(server)
  pendingTimeouts.set(
    server,
    setTimeout(() => server.close(1008, 'Authentication timed out'), PENDING_AUTH_TIMEOUT_MS)
  )
  const expiresAt = connectedAt + PENDING_AUTH_TIMEOUT_MS
  const existingAlarm = await state.storage.getAlarm()
  if (existingAlarm === null || existingAlarm > expiresAt) {
    await state.storage.setAlarm(expiresAt)
  }
  return new Response(null, { status: 101, webSocket: client })
}

export function clearPendingRelayTimeout(socket: WebSocket): void {
  const timeout = pendingTimeouts.get(socket)
  if (timeout !== undefined) {
    clearTimeout(timeout)
    pendingTimeouts.delete(socket)
  }
}

export async function expirePendingRelaySockets(state: DurableObjectState): Promise<void> {
  const now = Date.now()
  let nextExpiry: number | null = null
  for (const socket of state.getWebSockets()) {
    const attachment = relayAttachment(socket)
    if (attachment?.role !== 'pending') {
      continue
    }
    const expiresAt = attachment.connectedAt + PENDING_AUTH_TIMEOUT_MS
    if (expiresAt <= now) {
      socket.close(1008, 'Authentication timed out')
    } else {
      nextExpiry = nextExpiry === null ? expiresAt : Math.min(nextExpiry, expiresAt)
    }
  }
  await (nextExpiry === null ? state.storage.deleteAlarm() : state.storage.setAlarm(nextExpiry))
}

export function relayAttachment(socket: WebSocket | undefined): RelayAttachment | null {
  if (!socket) {
    return null
  }
  const value: unknown = socket.deserializeAttachment()
  if (!value || typeof value !== 'object') {
    return null
  }
  const role = Reflect.get(value, 'role')
  if (role === 'pending') {
    const connectedAt = Reflect.get(value, 'connectedAt')
    return typeof connectedAt === 'number' ? { role, connectedAt } : null
  }
  if (role === 'machine') {
    const runtimePublicKeyB64 = Reflect.get(value, 'runtimePublicKeyB64')
    return typeof runtimePublicKeyB64 === 'string' ? { role, runtimePublicKeyB64 } : null
  }
  if (role === 'browser') {
    const browserId = Reflect.get(value, 'browserId')
    const connectionId = Reflect.get(value, 'connectionId')
    return typeof browserId === 'string' && typeof connectionId === 'string'
      ? { role, browserId, connectionId }
      : null
  }
  return null
}
