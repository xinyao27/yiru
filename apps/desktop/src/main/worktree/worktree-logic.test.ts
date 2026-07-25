import { describe, expect, it } from 'vite-plus/test'

import { computeRemoteWorktreePath } from './worktree-logic'

const desktopWorkspaceSettings = {
  nestWorkspaces: false,
  workspaceDir: '/local/workspaces'
}

describe('computeRemoteWorktreePath', () => {
  it('qualifies SSH sibling paths with the repository name', () => {
    expect(
      computeRemoteWorktreePath(
        'main',
        '/remote/bioinformatist.github.io',
        desktopWorkspaceSettings
      )
    ).toBe('/remote/bioinformatist.github.io-main')
    expect(computeRemoteWorktreePath('main-2', '/remote/dotfiles', desktopWorkspaceSettings)).toBe(
      '/remote/dotfiles-main-2'
    )
  })

  it('uses remote Windows path semantics and strips a .git suffix', () => {
    expect(
      computeRemoteWorktreePath('main', 'C:\\Remote\\dotfiles.git', {
        nestWorkspaces: false,
        workspaceDir: 'C:\\Local\\workspaces'
      })
    ).toBe('C:\\Remote\\dotfiles-main')
  })

  it('does not qualify a repo-specific absolute remote workspace directory', () => {
    expect(
      computeRemoteWorktreePath(
        'feature',
        '/remote/project/repo',
        { nestWorkspaces: false, workspaceDir: '/remote/worktrees' },
        { useConfiguredAbsolutePath: true }
      )
    ).toBe('/remote/worktrees/feature')
  })
})
