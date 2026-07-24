import { describe, expect, it } from 'vite-plus/test'

import {
  assertBranchPrefixValid,
  getBranchPrefixIssue,
  normalizeBranchPrefix,
  selectBranchPrefixInput
} from './branch-prefix'

describe('branch prefix policy', () => {
  it('normalizes separators while preserving valid nested prefixes', () => {
    expect(normalizeBranchPrefix(' /team//frontend/ ')).toBe('team/frontend')
    expect(normalizeBranchPrefix(' // ')).toBe('')
  })

  it.each(['team x', 'team~x', 'team:x', 'team[x', 'team\\x', 'team..x', 'team@{x', '.team'])(
    'rejects Git-incompatible prefix %s',
    (prefix) => {
      expect(getBranchPrefixIssue(prefix)).toBe('invalid-characters')
      expect(() => assertBranchPrefixValid(prefix)).toThrow('Settings → Git')
    }
  )

  it('selects only the configured prefix source', () => {
    expect(selectBranchPrefixInput({ branchPrefix: 'git-username' }, 'jdoe')).toBe('jdoe')
    expect(
      selectBranchPrefixInput(
        { branchPrefix: 'custom', branchPrefixCustom: 'team/frontend' },
        'jdoe'
      )
    ).toBe('team/frontend')
    expect(selectBranchPrefixInput({ branchPrefix: 'none' }, 'jdoe')).toBeNull()
  })
})
