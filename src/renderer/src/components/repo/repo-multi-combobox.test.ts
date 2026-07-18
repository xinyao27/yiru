import { describe, expect, it } from 'vite-plus/test'
import type { Repo } from '../../../../shared/types'
import { getRepoMultiComboboxDetail } from './repo-multi-combobox'

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/Users/jinwoo/yiru',
    displayName: 'yiru',
    badgeColor: '#999999',
    addedAt: 1,
    ...overrides
  }
}

describe('getRepoMultiComboboxDetail', () => {
  it('shows host context before the path when available', () => {
    expect(getRepoMultiComboboxDetail(repo(), 'Local Mac')).toBe('Local Mac · /Users/jinwoo/yiru')
    expect(getRepoMultiComboboxDetail(repo({ path: '/home/yiru/yiru' }), 'openclaw 2')).toBe(
      'openclaw 2 · /home/yiru/yiru'
    )
  })

  it('keeps the existing path-only detail when no host label is provided', () => {
    expect(getRepoMultiComboboxDetail(repo(), null)).toBe('/Users/jinwoo/yiru')
    expect(getRepoMultiComboboxDetail(repo(), '   ')).toBe('/Users/jinwoo/yiru')
  })
})
