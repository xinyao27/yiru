export const TOGGLE_GLOBAL_ASSISTANT_EVENT = 'yiru-toggle-global-assistant'

export type GlobalAssistantRequestMode = 'reuse' | 'restart'

export function requestGlobalAssistant(mode: GlobalAssistantRequestMode = 'reuse'): void {
  window.dispatchEvent(
    new CustomEvent(TOGGLE_GLOBAL_ASSISTANT_EVENT, {
      detail: { mode }
    })
  )
}

export function getGlobalAssistantRequestMode(event: Event): GlobalAssistantRequestMode {
  return event instanceof CustomEvent && event.detail?.mode === 'restart' ? 'restart' : 'reuse'
}
