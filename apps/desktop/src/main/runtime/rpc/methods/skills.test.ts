import { describe, expect, it, vi } from 'vite-plus/test'

import type { RpcContext } from '../core'

const { getActiveMultiplexerMock } = vi.hoisted(() => ({
  getActiveMultiplexerMock: vi.fn()
}))

vi.mock('../../../ipc/ssh', () => ({
  getActiveMultiplexer: getActiveMultiplexerMock
}))

vi.mock('../../../skills/skill-discovery-target', () => ({
  resolveSkillDiscoveryTarget: vi.fn((target) => ({ kind: 'native-host', cwd: target?.cwd })),
  discoverSkillsOnTarget: vi.fn(async () => ({ skills: [], sources: [], scannedAt: 1 }))
}))

import { resolveSkillDiscoveryTarget } from '../../../skills/skill-discovery-target'
import { SKILL_METHODS } from './skills'

const WSL_RUNTIME = {
  status: 'resolved',
  runtime: {
    kind: 'wsl',
    hostPlatform: 'wsl',
    projectId: 'project-1',
    distro: 'Ubuntu',
    reason: 'project-override',
    cacheKey: 'wsl:Ubuntu'
  }
} as const

function makeContext(overrides: {
  resolveProjectRuntimeForWorktree?: (worktreeId: string | null | undefined) => unknown
}): RpcContext {
  return {
    runtime: {
      listRepos: () => [],
      resolveProjectRuntimeForWorktree:
        overrides.resolveProjectRuntimeForWorktree ?? (() => undefined)
    }
  } as unknown as RpcContext
}

function discoverMethod() {
  const method = SKILL_METHODS.find((entry) => entry.name === 'skills.discover')
  if (!method) {
    throw new Error('skills.discover method not registered')
  }
  return method
}

describe('skills.discover RPC', () => {
  it('delegates direct SSH discovery only after the relay advertises support', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'session.capabilities') {
        return { capabilities: ['skills.discover.v1'] }
      }
      return { skills: [], sources: [], scannedAt: 4 }
    })
    getActiveMultiplexerMock.mockReturnValue({ isDisposed: () => false, request })

    await expect(
      discoverMethod().handler(
        {
          cwd: '/remote/repo',
          worktreeId: 'worktree-1',
          executionHostId: 'ssh:target-1'
        },
        makeContext({})
      )
    ).resolves.toEqual({ skills: [], sources: [], scannedAt: 4 })
    expect(getActiveMultiplexerMock).toHaveBeenCalledWith('target-1')
    expect(request.mock.calls).toEqual([
      ['session.capabilities'],
      ['skills.discover', { cwd: '/remote/repo' }]
    ])
  })

  it('does not call an additive discovery method on an older SSH relay', async () => {
    const unsupported = Object.assign(new Error('Method not found: session.capabilities'), {
      code: -32601
    })
    const request = vi.fn(async () => {
      throw unsupported
    })
    getActiveMultiplexerMock.mockReturnValue({ isDisposed: () => false, request })

    await expect(
      discoverMethod().handler(
        { cwd: '/remote/repo', executionHostId: 'ssh:target-1' },
        makeContext({})
      )
    ).rejects.toThrow('does not support skill discovery')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('resolves the project runtime from the owning runtime store when the caller omits it', async () => {
    const resolveProjectRuntimeForWorktree = vi.fn(() => WSL_RUNTIME)
    await discoverMethod().handler(
      { cwd: 'C:\\repo', worktreeId: 'worktree-1' },
      makeContext({ resolveProjectRuntimeForWorktree })
    )
    expect(resolveProjectRuntimeForWorktree).toHaveBeenCalledWith('worktree-1')
    expect(vi.mocked(resolveSkillDiscoveryTarget)).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectRuntime: WSL_RUNTIME })
    )
  })

  it('prefers a caller-supplied project runtime over store resolution', async () => {
    const resolveProjectRuntimeForWorktree = vi.fn()
    await discoverMethod().handler(
      { cwd: '/repo', worktreeId: 'worktree-1', projectRuntime: WSL_RUNTIME },
      makeContext({ resolveProjectRuntimeForWorktree })
    )
    expect(resolveProjectRuntimeForWorktree).not.toHaveBeenCalled()
    expect(vi.mocked(resolveSkillDiscoveryTarget)).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectRuntime: WSL_RUNTIME })
    )
  })
})
