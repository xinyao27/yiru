import { describe, expect, it } from 'vite-plus/test'
import { buildAppFontFamily } from './app-font-family'

describe('buildAppFontFamily', () => {
  it('defaults to the native system UI stack', () => {
    expect(buildAppFontFamily('')).toBe(
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    )
  })

  it('places a custom UI font before the fallback chain', () => {
    expect(buildAppFontFamily('Inter')).toBe(
      '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    )
  })

  it('does not duplicate the system font when selected explicitly', () => {
    expect(buildAppFontFamily('system-ui')).toBe(
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    )
  })
})
