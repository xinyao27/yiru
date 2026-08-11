import { useSyncExternalStore } from 'react'
import type { SupportedUiLocale } from '~shared/ui-locale'

import { getRendererLocale, subscribeRendererLocale } from './i18n'

export function useUiLocale(): SupportedUiLocale {
  return useSyncExternalStore(subscribeRendererLocale, getRendererLocale, getRendererLocale)
}
