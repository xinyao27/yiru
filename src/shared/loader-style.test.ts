import { describe, expect, it } from 'vitest'
import { DEFAULT_LOADER_STYLE, LOADER_STYLES, normalizeLoaderStyle } from './loader-style'

describe('normalizeLoaderStyle', () => {
  it.each(LOADER_STYLES)('preserves the supported %s style', (loaderStyle) => {
    expect(normalizeLoaderStyle(loaderStyle)).toBe(loaderStyle)
  })

  it('falls back to drawn icons for missing or invalid persisted values', () => {
    expect(normalizeLoaderStyle(undefined)).toBe(DEFAULT_LOADER_STYLE)
    expect(normalizeLoaderStyle('rainbow')).toBe(DEFAULT_LOADER_STYLE)
  })
})
