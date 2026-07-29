export const TOGGLE_FRIDAY_EVENT = 'yiru-toggle-friday'

export type FridayRequestMode = 'reuse' | 'restart'

export function requestFriday(mode: FridayRequestMode = 'reuse'): void {
  window.dispatchEvent(
    new CustomEvent(TOGGLE_FRIDAY_EVENT, {
      detail: { mode }
    })
  )
}

export function getFridayRequestMode(event: Event): FridayRequestMode {
  return event instanceof CustomEvent && event.detail?.mode === 'restart' ? 'restart' : 'reuse'
}
