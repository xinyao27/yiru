import { describe, expect, it } from 'vite-plus/test'

import { computeDiffEditorFontSize, computeEditorFontSize } from './editor-font-zoom'

describe('editor font zoom', () => {
  it('keeps diff editors at the same scale as regular editor surfaces', () => {
    expect(computeDiffEditorFontSize(13, 0)).toBe(13)
    expect(computeDiffEditorFontSize(13, 3)).toBe(computeEditorFontSize(13, 3))
  })

  it('keeps diff editor font size within the editor safety bounds', () => {
    expect(computeDiffEditorFontSize(10, -6)).toBe(8)
    expect(computeDiffEditorFontSize(24, 18)).toBe(32)
  })
})
