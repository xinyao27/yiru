import type { RuntimeStatsUsageProvider } from '@yiru/runtime-protocol/mobile-runtime-types'

import { translate } from '../../i18n/translate'

export const HOME_USAGE_PROVIDERS: readonly RuntimeStatsUsageProvider[] = [
  'claude',
  'codex',
  'open-code'
]

export function providerLabel(provider: RuntimeStatsUsageProvider): string {
  switch (provider) {
    case 'claude':
      return translate('mobile.home.provider.claude', 'Claude')
    case 'codex':
      return translate('mobile.home.provider.codex', 'Codex')
    case 'open-code':
      return translate('mobile.home.provider.openCode', 'OpenCode')
  }
}

// Why: providers separate by lightness on one neutral token, because color here
// would compete with the status palette reserved for activity and errors.
export function providerOpacity(provider: RuntimeStatsUsageProvider): number {
  switch (provider) {
    case 'claude':
      return 1
    case 'codex':
      return 0.66
    case 'open-code':
      return 0.38
  }
}
