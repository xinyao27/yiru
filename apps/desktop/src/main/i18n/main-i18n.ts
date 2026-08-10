import {
  renderCompiledMessage,
  type TranslationVariables
} from '~shared/localization/message-renderer'
import { UI_LANGUAGE_SYSTEM, type UiLanguage } from '~shared/ui-language'
import { DEFAULT_UI_LOCALE, resolveUiLocale, type SupportedUiLocale } from '~shared/ui-locale'

import * as messages from '../../../generated/paraglide/messages.js'

export type MainSystemLocaleProvider = () => string

let activeLocale: SupportedUiLocale = DEFAULT_UI_LOCALE
let systemLocaleProvider: MainSystemLocaleProvider = () => DEFAULT_UI_LOCALE

export function getMainSystemLocale(): string {
  try {
    return systemLocaleProvider()
  } catch {
    return DEFAULT_UI_LOCALE
  }
}

export function setMainSystemLocaleProvider(provider: MainSystemLocaleProvider): void {
  systemLocaleProvider = provider
}

export function setMainUiLanguage(language: UiLanguage): SupportedUiLocale {
  activeLocale = resolveUiLocale(
    language,
    language === UI_LANGUAGE_SYSTEM ? getMainSystemLocale() : DEFAULT_UI_LOCALE
  )
  return activeLocale
}

export function translateMain(
  key: string,
  fallback: string,
  variables?: TranslationVariables
): string {
  return renderCompiledMessage(messages, key, fallback, activeLocale, variables)
}
