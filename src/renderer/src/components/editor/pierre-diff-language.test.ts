import { describe, expect, it } from 'vitest'
import { resolvePierreDiffLanguage } from './pierre-diff-language'

describe('resolvePierreDiffLanguage', () => {
  it('uses Pierre file formats and maps editor-only fallback ids', () => {
    expect(resolvePierreDiffLanguage('src/view.tsx', 'typescript')).toBe('tsx')
    expect(resolvePierreDiffLanguage('notebooks/run.ipynb', 'notebook')).toBe('json')
    expect(resolvePierreDiffLanguage('rtl/top.sv', 'systemverilog')).toBe('system-verilog')
    expect(resolvePierreDiffLanguage('notes/README.unknown', 'plaintext')).toBe('text')
  })
})
