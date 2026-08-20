import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'

const subscribers = new Set<(batch: TerminalSideEffectBatch) => void>()

export function subscribeRendererTerminalSideEffects(
  callback: (batch: TerminalSideEffectBatch) => void
): () => void {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

export function publishRendererTerminalSideEffects(batch: TerminalSideEffectBatch): void {
  for (const subscriber of subscribers) {
    subscriber(batch)
  }
}

export async function getRendererTerminalSideEffectSnapshot(
  _ptyId: string
): Promise<TerminalSideEffectBatch | null> {
  return null
}
