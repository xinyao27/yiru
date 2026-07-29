type TranslationValues = Record<string, string | number>

// Why: mobile does not yet bundle locale catalogs, but feature copy still goes
// through a keyed boundary so catalogs can replace fallbacks without rewriting UI.
export function translate(key: string, fallback: string, values: TranslationValues = {}): string {
  void key
  let result = fallback
  for (const [name, value] of Object.entries(values)) {
    result = result.split(`{{${name}}}`).join(String(value))
  }
  return result
}
