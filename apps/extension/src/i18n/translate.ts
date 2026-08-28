export function translate(
  key: string,
  fallback: string,
  values: Record<string, string | number> = {}
): string {
  const translated = chrome.i18n.getMessage(key, Object.values(values).map(String))
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{{${name}}}`, String(value)),
    translated || fallback
  )
}
