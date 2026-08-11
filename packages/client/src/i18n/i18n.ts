import {
  renderCompiledMessage,
  type TranslationVariables
} from '~shared/localization/message-renderer'
import type { UiLanguage } from '~shared/ui-language'
import type { SupportedUiLocale } from '~shared/ui-locale'

import * as messages from '../../../generated/paraglide/messages.js'
import { DEFAULT_LOCALE, resolveUiLocale } from './supported-languages'

let activeLocale: SupportedUiLocale = DEFAULT_LOCALE
const localeListeners = new Set<() => void>()

export function translate(key: string, fallback: string, variables?: TranslationVariables): string {
  return renderCompiledMessage(messages, key, fallback, activeLocale, variables)
}

export function getRendererLocale(): SupportedUiLocale {
  return activeLocale
}

export function subscribeRendererLocale(listener: () => void): () => void {
  localeListeners.add(listener)
  return () => localeListeners.delete(listener)
}

export function setRendererUiLanguage(language: UiLanguage): void {
  const locale = resolveUiLocale(language)
  document.documentElement.lang = locale
  if (locale === activeLocale) {
    return
  }
  activeLocale = locale
  for (const listener of localeListeners) {
    listener()
  }
}
