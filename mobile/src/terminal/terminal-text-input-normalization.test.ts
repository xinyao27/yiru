import { describe, expect, it } from 'vite-plus/test'

import { normalizeTerminalTextInput } from './terminal-text-input-normalization'

describe('normalizeTerminalTextInput', () => {
  it('converts iOS smart dash replacements back to terminal hyphens', () => {
    expect(normalizeTerminalTextInput('git checkout – file')).toBe('git checkout -- file')
    expect(normalizeTerminalTextInput('git checkout — file')).toBe('git checkout -- file')
  })

  it('keeps ASCII hyphens unchanged', () => {
    expect(normalizeTerminalTextInput('git checkout -- file')).toBe('git checkout -- file')
  })
})
