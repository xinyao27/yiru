import type { Buffer } from 'node:buffer'

export type HandshakeState = 'awaiting_ready' | 'awaiting_authenticated' | 'ready'

export function ignoreSettledRemoteRuntimeSocketError(): void {}

export function formatRemoteRuntimeCloseMessage(code: number, reason: Buffer): string {
  const suffixParts: string[] = []
  if (code !== 1005 && code !== 1006) {
    suffixParts.push(String(code))
  }
  const reasonText = reason.toString().trim()
  if (reasonText) {
    suffixParts.push(reasonText)
  }
  return suffixParts.length > 0
    ? `Runtime host closed the connection (${suffixParts.join(': ')}).`
    : 'Runtime host closed the connection.'
}
