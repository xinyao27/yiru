import type { SupportedUiLocale } from '@yiru/runtime-protocol/workbench/ui-locale'
import { useSyncExternalStore } from 'react'

import { getRendererLocale, subscribeRendererLocale } from './i18n'

export function useUiLocale(): SupportedUiLocale {
  return useSyncExternalStore(subscribeRendererLocale, getRendererLocale, getRendererLocale)
}
