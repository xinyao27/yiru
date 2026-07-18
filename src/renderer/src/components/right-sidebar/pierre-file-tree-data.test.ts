import { describe, expect, it } from 'vitest'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import type { TreeNode } from './file-explorer-types'
import {
  buildPierreFileTreeData,
  buildPierreGitStatusEntries,
  getCanonicalParentPath
} from './pierre-file-tree-data'

const directory: TreeNode = {
  name: 'src',
  path: 'C:\\repo\\src',
  relativePath: 'src',
  isDirectory: true,
  depth: 0
}
const file: TreeNode = {
  name: 'index.ts',
  path: 'C:\\repo\\src\\index.ts',
  relativePath: 'src\\index.ts',
  isDirectory: false,
  depth: 1
}

describe('Pierre file tree data', () => {
  it('declares unloaded directories without inventing keyboard-visible child rows', () => {
    const tree = buildPierreFileTreeData(createFileExplorerRowProjection([directory]))

    // Why: Trees treats a trailing slash as an expandable directory, so SSH
    // loading can stay lazy without a hidden sentinel in its keyboard model.
    expect(tree.paths).toEqual(['src/'])
    expect(tree.canonicalPathByAbsolutePath.get(directory.path)).toBe('src/')
  })

  it('uses canonical slash paths for expanded local, Windows, and SSH rows', () => {
    const tree = buildPierreFileTreeData(createFileExplorerRowProjection([directory, file]))

    expect(tree.paths).toEqual(['src/', 'src/index.ts'])
    expect(getCanonicalParentPath('C:\\repo', 'C:\\repo\\src')).toBe('src/')
    expect(getCanonicalParentPath('/repo', '/repo')).toBe('')
  })

  it('maps supported git states while copied rows keep their custom C decoration', () => {
    expect(
      buildPierreGitStatusEntries(
        new Map([
          ['src\\added.ts', 'added'],
          ['src/copied.ts', 'copied']
        ]),
        new Set(['build\\cache', 'src/added.ts'])
      )
    ).toEqual([
      { path: 'src/added.ts', status: 'added' },
      { path: 'build/cache', status: 'ignored' }
    ])
  })
})
