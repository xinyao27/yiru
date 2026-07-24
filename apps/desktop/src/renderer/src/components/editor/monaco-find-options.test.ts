import { describe, expect, it } from 'vite-plus/test'

import { monacoFindOptions } from './monaco-find-options'

describe('monacoFindOptions', () => {
  it('seeds Find from selected editor text without restricting the search range', () => {
    expect(monacoFindOptions).toEqual({
      addExtraSpaceOnTop: false,
      autoFindInSelection: 'never',
      seedSearchStringFromSelection: 'selection'
    })
  })
})
