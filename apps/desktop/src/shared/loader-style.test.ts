import { describe, expect, it } from 'vite-plus/test'

import {
  DEFAULT_LOADER_STYLE,
  LOADER_STYLES,
  THINKING_ORB_LOADER_STYLES,
  normalizeLoaderStyle
} from './loader-style'

describe('loader styles', () => {
  it('accepts every registered style, including every Thinking Orb', () => {
    expect(THINKING_ORB_LOADER_STYLES).toHaveLength(6)
    expect(LOADER_STYLES.map(normalizeLoaderStyle)).toEqual(LOADER_STYLES)
  })

  it('falls back when persisted settings contain an unknown style', () => {
    expect(normalizeLoaderStyle('unknown-loader')).toBe(DEFAULT_LOADER_STYLE)
  })
})
