import type { GlobalSettings } from '~shared/types'

// Why: the full settings document selects the active runtime, so routing its
// own read/write through that runtime would be circular. This renderer adapter
// is the single shell-owned boundary; host-scoped settings use oRPC directly.
export function getRendererSettings(): Promise<GlobalSettings> {
  return window.api.settings.get()
}

export function getRendererSettingsSync(): GlobalSettings | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.api.settings.getSync()
  } catch {
    // Why: startup reads can race renderer teardown; callers preserve their
    // default-on behavior when persisted settings are unavailable.
    return null
  }
}

export function updateRendererSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
  return window.api.settings.set(updates)
}

export function updateRendererPRBotAuthorOverride(args: {
  author: string
  isBot: boolean
}): Promise<GlobalSettings> {
  return window.api.settings.updatePRBotAuthorOverride(args)
}
