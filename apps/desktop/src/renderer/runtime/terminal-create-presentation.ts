import type { RuntimeTerminalPresentation } from '~shared/runtime-types'

// Why: shared by terminal-create-shell-request.ts's `create` and
// terminal-reveal-shell-request.ts's `reveal` — both derive the same
// focused/background presentation from a `presentation`/`activate` pair, a
// duplicate of the removed use-ipc-events.ts local of the same name.
export function resolveTerminalPresentation(data: {
  presentation?: RuntimeTerminalPresentation
  activate?: boolean
}): RuntimeTerminalPresentation | undefined {
  if (data.presentation) {
    return data.presentation
  }
  if (data.activate === true) {
    return 'focused'
  }
  return undefined
}
