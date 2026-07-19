export function formatSpoolPeerAddress(address: string): string {
  return address.includes(':') ? `[${address}]` : address
}

export function isSpoolReadyFrame(frame: string): boolean {
  return hasFrameType(frame, 'e2ee_ready')
}

export function isSpoolAuthenticatedFrame(frame: string): boolean {
  return hasFrameType(frame, 'e2ee_authenticated')
}

function hasFrameType(frame: string, expectedType: string): boolean {
  try {
    return (JSON.parse(frame) as { type?: unknown }).type === expectedType
  } catch {
    return false
  }
}
