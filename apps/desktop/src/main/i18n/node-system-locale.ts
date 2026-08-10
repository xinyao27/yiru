import { DEFAULT_UI_LOCALE } from '~shared/ui-locale'

export function getNodeSystemLocale(): string {
  const environmentLocale =
    process.env.LC_ALL?.trim() || process.env.LC_MESSAGES?.trim() || process.env.LANG?.trim()
  if (environmentLocale) {
    return environmentLocale
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || DEFAULT_UI_LOCALE
  } catch {
    return DEFAULT_UI_LOCALE
  }
}
