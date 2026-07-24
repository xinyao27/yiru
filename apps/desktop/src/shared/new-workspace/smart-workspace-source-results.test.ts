import { getVisibleBranchResults } from '@yiru/workbench-model/workspace'
import { describe, expect, it } from 'vite-plus/test'

const branch = (refName: string, localBranchName = refName) => ({ refName, localBranchName })

describe('getVisibleBranchResults', () => {
  it('puts origin/main first for an empty branch query', () => {
    const results = getVisibleBranchResults({
      branches: [
        branch('editor-dx'),
        branch('main'),
        branch('shrimp'),
        branch('origin/main', 'main')
      ],
      defaultBaseRef: null,
      mode: 'branches',
      resultRepoId: 'repo-1',
      resultQuery: '',
      selectedRepoId: 'repo-1',
      value: ''
    })

    expect(results.map(({ refName }) => refName)).toEqual([
      'origin/main',
      'editor-dx',
      'main',
      'shrimp'
    ])
  })

  it('puts main first when origin/main is unavailable', () => {
    const results = getVisibleBranchResults({
      branches: [branch('editor-dx'), branch('main'), branch('shrimp')],
      defaultBaseRef: null,
      mode: 'branches',
      resultRepoId: 'repo-1',
      resultQuery: '',
      selectedRepoId: 'repo-1',
      value: ''
    })

    expect(results.map(({ refName }) => refName)).toEqual(['main', 'editor-dx', 'shrimp'])
  })
})
