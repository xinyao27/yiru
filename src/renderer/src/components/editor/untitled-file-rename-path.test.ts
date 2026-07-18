import { describe, expect, it } from 'vite-plus/test'
import { getUntitledFileRoot } from './untitled-file-rename-path'

describe('getUntitledFileRoot', () => {
  it('uses the real worktree path when one exists', () => {
    expect(
      getUntitledFileRoot(
        { filePath: '/tmp/floating/untitled.md', relativePath: 'untitled.md' },
        '/repo/worktree'
      )
    ).toBe('/repo/worktree')
  })

  it('falls back to the file root for floating markdown files', () => {
    expect(
      getUntitledFileRoot({
        filePath: '/Users/alice/Library/Application Support/Yiru/floating-workspace/untitled.md',
        relativePath: 'untitled.md'
      })
    ).toBe('/Users/alice/Library/Application Support/Yiru/floating-workspace')
  })

  it('handles nested untitled relative paths', () => {
    expect(
      getUntitledFileRoot({
        filePath: '/tmp/yiru/floating-workspace/notes/untitled.md',
        relativePath: 'notes/untitled.md'
      })
    ).toBe('/tmp/yiru/floating-workspace')
  })
})
