import type { SshConnectionStatus } from '@yiru/runtime-protocol/ssh-connection'
import { translate } from '~renderer/i18n/i18n'

// Why: getters, not plain values — the module-level object is evaluated at import
// time, before the locale catalog is hydrated, so eager translate() calls would
// freeze every label to its English fallback for the app's lifetime.
export const STATUS_LABELS: Record<SshConnectionStatus, string> = {
  get disconnected() {
    return translate('auto.components.settings.SshTargetCard.fc028bdfa9', 'Disconnected')
  },
  get connecting() {
    return translate('auto.components.settings.SshTargetCard.0d4da494f9', 'Connecting…')
  },
  get 'auth-failed'() {
    return translate('auto.components.settings.SshTargetCard.a6d5b7a30b', 'Auth failed')
  },
  get 'deploying-relay'() {
    return translate('auto.components.settings.SshTargetCard.8f14a926e0', 'Deploying relay…')
  },
  get connected() {
    return translate('auto.components.settings.SshTargetCard.8df62d1912', 'Connected')
  },
  get reconnecting() {
    return translate('auto.components.settings.SshTargetCard.d4986d71b0', 'Reconnecting…')
  },
  get 'reconnection-failed'() {
    return translate('auto.components.settings.SshTargetCard.ec37738139', 'Reconnection failed')
  },
  get error() {
    return translate('auto.components.settings.SshTargetCard.18968ede9e', 'Error')
  }
}

export function statusColor(status: SshConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500'
    case 'connecting':
    case 'deploying-relay':
    case 'reconnecting':
      return 'bg-yellow-500'
    case 'auth-failed':
    case 'reconnection-failed':
    case 'error':
      return 'bg-red-500'
    case 'disconnected':
      return 'bg-muted-foreground/40'
  }
}
