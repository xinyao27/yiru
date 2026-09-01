import type { TranslationVariables } from '@yiru/runtime-protocol/workbench/localization/message-renderer'
import { UI_LANGUAGE_SYSTEM, type UiLanguage } from '@yiru/runtime-protocol/workbench/ui-language'
import {
  DEFAULT_UI_LOCALE,
  resolveUiLocale,
  type SupportedUiLocale
} from '@yiru/runtime-protocol/workbench/ui-locale'

import { renderMainMessage } from './messages'

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
  return renderMainMessage(activeLocale, key, fallback, variables)
}
