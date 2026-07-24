import { MIN_COMPATIBLE_RUNTIME_SERVER_VERSION, RUNTIME_PROTOCOL_VERSION } from './protocol-version'

export type RuntimeCompatVerdict =
  | {
      kind: 'ok'
      clientProtocolVersion: number
      serverProtocolVersion: number
    }
  | {
      kind: 'blocked'
      reason: 'client-too-old' | 'server-too-old'
      clientProtocolVersion: number
      serverProtocolVersion: number
      requiredClientProtocolVersion?: number
      requiredServerProtocolVersion?: number
    }

export function evaluateRuntimeCompat(input: {
  clientProtocolVersion: number
  minCompatibleServerProtocolVersion: number
  serverProtocolVersion: number | undefined
  serverMinCompatibleClientProtocolVersion: number | undefined
}): RuntimeCompatVerdict {
  // Why: absent fields are protocol 0, so new clients fail clearly against
  // servers that predate compatibility negotiation.
  const serverProtocolVersion = input.serverProtocolVersion ?? 0
  const requiredClientProtocolVersion = input.serverMinCompatibleClientProtocolVersion ?? 0

  if (input.clientProtocolVersion < requiredClientProtocolVersion) {
    return {
      kind: 'blocked',
      reason: 'client-too-old',
      clientProtocolVersion: input.clientProtocolVersion,
      serverProtocolVersion,
      requiredClientProtocolVersion
    }
  }
  if (serverProtocolVersion < input.minCompatibleServerProtocolVersion) {
    return {
      kind: 'blocked',
      reason: 'server-too-old',
      clientProtocolVersion: input.clientProtocolVersion,
      serverProtocolVersion,
      requiredServerProtocolVersion: input.minCompatibleServerProtocolVersion
    }
  }
  return {
    kind: 'ok',
    clientProtocolVersion: input.clientProtocolVersion,
    serverProtocolVersion
  }
}

export function describeRuntimeCompatBlock(verdict: RuntimeCompatVerdict): string {
  if (verdict.kind === 'ok') {
    return 'Runtime client and server are compatible.'
  }
  if (verdict.reason === 'client-too-old') {
    return `This Yiru client is too old for the selected server. Update Yiru on this machine. Client protocol ${verdict.clientProtocolVersion}, server requires client protocol ${verdict.requiredClientProtocolVersion}.`
  }
  return `The selected Yiru server is too old for this client. Update Yiru on the server. Server protocol ${verdict.serverProtocolVersion}, client requires server protocol ${verdict.requiredServerProtocolVersion}.`
}

export type MobileRuntimeCompatVerdict =
  | { kind: 'ok' }
  | {
      kind: 'blocked'
      reason: 'mobile-too-old' | 'desktop-too-old'
      desktopVersion: number
      requiredMobileVersion?: number
      requiredDesktopVersion?: number
    }

export function evaluateMobileRuntimeCompat(input: {
  desktopProtocolVersion: number | undefined
  desktopMinCompatibleMobileVersion: number | undefined
}): MobileRuntimeCompatVerdict {
  const verdict = evaluateRuntimeCompat({
    clientProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    minCompatibleServerProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
    serverProtocolVersion: input.desktopProtocolVersion,
    serverMinCompatibleClientProtocolVersion: input.desktopMinCompatibleMobileVersion
  })

  if (verdict.kind === 'ok') {
    return { kind: 'ok' }
  }
  if (verdict.reason === 'client-too-old') {
    return {
      kind: 'blocked',
      reason: 'mobile-too-old',
      desktopVersion: verdict.serverProtocolVersion,
      requiredMobileVersion: verdict.requiredClientProtocolVersion
    }
  }
  return {
    kind: 'blocked',
    reason: 'desktop-too-old',
    desktopVersion: verdict.serverProtocolVersion,
    requiredDesktopVersion: verdict.requiredServerProtocolVersion
  }
}
