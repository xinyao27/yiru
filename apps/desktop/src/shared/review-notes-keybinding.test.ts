import { describe, expect, it } from 'vite-plus/test'

import { getEffectiveKeybindingsForAction, getKeybindingDefinition } from './keybindings'

describe('Send Review Notes to Agent keybinding', () => {
  it('is assignable without reserving a default platform chord', () => {
    const definition = getKeybindingDefinition('sourceControl.sendReviewNotes')
    expect(definition).toMatchObject({
      title: 'Send Review Notes to Agent',
      scope: 'global',
      conflictGroup: 'editor'
    })
    expect(getEffectiveKeybindingsForAction('sourceControl.sendReviewNotes', 'darwin')).toEqual([])
    expect(getEffectiveKeybindingsForAction('sourceControl.sendReviewNotes', 'linux')).toEqual([])
    expect(getEffectiveKeybindingsForAction('sourceControl.sendReviewNotes', 'win32')).toEqual([])
  })
})
