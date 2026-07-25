import { describe, expect, it } from 'vite-plus/test'

import { computeBranchName, computeValidatedBranchName } from './worktree-branch-name'

describe('computeBranchName', () => {
  it('normalizes surrounding and duplicate separators before joining the branch leaf', () => {
    expect(
      computeBranchName(
        'feature',
        { branchPrefix: 'custom', branchPrefixCustom: ' /team//frontend/ ' },
        null
      )
    ).toBe('team/frontend/feature')
  })
})

describe('computeValidatedBranchName', () => {
  it('rejects a configured prefix before it reaches Git', () => {
    expect(() =>
      computeValidatedBranchName(
        'feature',
        { branchPrefix: 'custom', branchPrefixCustom: 'team x' },
        null
      )
    ).toThrow('Branch prefix "team x" contains characters Git rejects')
  })
})
