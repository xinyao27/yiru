import { describe, expect, it } from 'vite-plus/test'

import { DEFAULT_LOADER_STYLE, normalizeLoaderStyle } from './loader-style'

describe('loader styles', () => {
  it('falls back when persisted settings contain an unknown style', () => {
    expect(normalizeLoaderStyle('unknown-loader')).toBe(DEFAULT_LOADER_STYLE)
  })
})
