import { describe, expect, it } from 'vite-plus/test'

import { resolveEditorFontFamily, resolveEditorFontFamilyOrInherit } from './editor-font-family'

describe('resolveEditorFontFamily', () => {
  it('follows the terminal font when the editor override is unset or blank', () => {
    expect(resolveEditorFontFamily({ terminalFontFamily: 'Menlo' })).toBe('Menlo')
    expect(resolveEditorFontFamily({ editorFontFamily: '   ', terminalFontFamily: 'Menlo' })).toBe(
      'Menlo'
    )
  })

  it('uses the opt-in editor font override', () => {
    expect(
      resolveEditorFontFamily({ editorFontFamily: 'JetBrains Mono', terminalFontFamily: 'Menlo' })
    ).toBe('JetBrains Mono')
  })

  it('uses a safe Monaco fallback when neither font is available', () => {
    expect(resolveEditorFontFamily(undefined)).toBe('monospace')
  })
})

describe('resolveEditorFontFamilyOrInherit', () => {
  it('preserves notebook UI-font inheritance when neither font is available', () => {
    expect(resolveEditorFontFamilyOrInherit(undefined)).toBeUndefined()
  })

  it('uses the same override order as editor surfaces', () => {
    expect(resolveEditorFontFamilyOrInherit({ terminalFontFamily: 'Menlo' })).toBe('Menlo')
    expect(
      resolveEditorFontFamilyOrInherit({
        editorFontFamily: 'Fira Code',
        terminalFontFamily: 'Menlo'
      })
    ).toBe('Fira Code')
  })
})
