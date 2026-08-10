import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'

export function subscribeRendererTerminalSideEffects(
  callback: (batch: TerminalSideEffectBatch) => void
): (() => void) | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.api.pty.onSideEffect(callback)
  } catch {
    // Why: the optional shell transport can be absent on non-preload surfaces
    // and can race renderer teardown.
    return null
  }
}

export async function getRendererTerminalSideEffectSnapshot(
  ptyId: string
): Promise<TerminalSideEffectBatch | null> {
  if (typeof window === 'undefined') {
    return null
  }
  return window.api.pty.getSideEffectSnapshot(ptyId)
}
