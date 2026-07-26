export function formatCoworkingPeerAddress(address: string): string {
  return address.includes(':') ? `[${address}]` : address
}

export function isCoworkingReadyFrame(frame: string): boolean {
  return hasFrameType(frame, 'e2ee_ready')
}

export function isCoworkingAuthenticatedFrame(frame: string): boolean {
  return hasFrameType(frame, 'e2ee_authenticated')
}

function hasFrameType(frame: string, expectedType: string): boolean {
  try {
    return (JSON.parse(frame) as { type?: unknown }).type === expectedType
  } catch {
    return false
  }
}
