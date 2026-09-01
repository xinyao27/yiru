export type HandshakeState = 'awaiting_ready' | 'awaiting_authenticated' | 'ready'

export function formatRemoteRuntimeCloseMessage(code: number, reason: string): string {
  const suffixParts: string[] = []
  if (code !== 1005 && code !== 1006) {
    suffixParts.push(String(code))
  }
  const reasonText = reason.trim()
  if (reasonText) {
    suffixParts.push(reasonText)
  }
  return suffixParts.length > 0
    ? `Runtime host closed the connection (${suffixParts.join(': ')}).`
    : 'Runtime host closed the connection.'
}
