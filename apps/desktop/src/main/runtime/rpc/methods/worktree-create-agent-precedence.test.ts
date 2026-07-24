import { describe, expect, it, vi } from 'vite-plus/test'

import { WORKTREE_METHODS } from './worktree'

function createHandler() {
  const method = WORKTREE_METHODS.find((candidate) => candidate.name === 'worktree.create')
  if (!method) {
    throw new Error('Missing worktree.create method')
  }
  return method.handler
}

describe('worktree.create agent launch precedence', () => {
  it('prefers structured startupAgent when a compatibility command is also present', async () => {
    const createManagedWorktree = vi.fn().mockResolvedValue({
      worktree: { id: 'repo::/workspace' }
    })
    const runtime = {
      showRepo: vi.fn().mockResolvedValue({ id: 'repo' }),
      createManagedWorktree
    }

    await createHandler()(
      {
        repo: 'id:repo',
        name: 'workspace',
        startupAgent: 'claude',
        startupCommand: 'claude --legacy-fallback',
        createdWithAgent: 'claude'
      },
      { runtime } as never
    )

    expect(createManagedWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        startupAgent: 'claude',
        createdWithAgent: 'claude',
        startup: undefined
      })
    )
  })
})
