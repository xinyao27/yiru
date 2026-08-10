import { getRendererLocale } from './i18n'

// Why: search metadata and catalogs call translate() during build. Caching per
// active locale keeps lookups cheap while still refreshing after language changes.
export function createLocalizedCatalog<T>(builder: () => T): () => T {
  let cachedLocale: string | undefined
  let cachedValue: T | undefined

  return () => {
    const locale = getRendererLocale()
    if (cachedLocale !== locale || cachedValue === undefined) {
      cachedLocale = locale
      cachedValue = builder()
    }
    return cachedValue
  }
}
