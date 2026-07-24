import { describe, expect, it } from 'vite-plus/test'

import type { DiscoveredSkill, SkillDiscoveryResult } from '../../../../shared/skills'
import {
  isNativeChatSkillForAgent,
  resolveNativeChatSkillDiscoveryContext,
  resolveNativeChatSkillDiscoveryCwd
} from './use-native-chat-skills'

const SOURCE_LABEL = 'Source'
const CODEX_HOME_LABEL = 'Codex home'
const AGENT_SKILLS_HOME_LABEL = 'Agent skills home'

function skill(overrides: Partial<DiscoveredSkill>): DiscoveredSkill {
  return {
    id: overrides.name ?? 'skill',
    name: 'agent-browser',
    description: null,
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    rootPath: '/Users/test/.agents/skills',
    directoryPath: '/Users/test/.agents/skills/agent-browser',
    skillFilePath: '/Users/test/.agents/skills/agent-browser/SKILL.md',
    installed: true,
    fileCount: 1,
    updatedAt: null,
    ...overrides
  }
}

function discovery(owner: string | null, rootPath = '/Users/test/.agents/skills') {
  return {
    sources: [
      {
        id: 'source',
        label: SOURCE_LABEL,
        path: rootPath,
        sourceKind: 'home' as const,
        providers: ['agent-skills' as const],
        owner,
        exists: true
      }
    ]
  } satisfies Pick<SkillDiscoveryResult, 'sources'>
}

describe('isNativeChatSkillForAgent', () => {
  it('shows Codex-native and generic agent skills for Codex chat', () => {
    expect(isNativeChatSkillForAgent('codex', skill({ providers: ['codex'] }))).toBe(true)
    expect(isNativeChatSkillForAgent('codex', skill({ providers: ['agent-skills'] }))).toBe(true)
  })

  it('keeps Claude skills out of the Codex skill picker', () => {
    expect(isNativeChatSkillForAgent('codex', skill({ providers: ['claude'] }))).toBe(false)
  })

  it('does not enable skill autocomplete for other agents yet', () => {
    expect(isNativeChatSkillForAgent('claude', skill({ providers: ['agent-skills'] }))).toBe(false)
  })

  it('uses explicit source ownership and keeps shared roots visible', () => {
    const shared = discovery(null)
    expect(isNativeChatSkillForAgent('codex', skill({}), shared)).toBe(true)
    expect(isNativeChatSkillForAgent('claude', skill({}), shared)).toBe(true)
    expect(isNativeChatSkillForAgent('grok', skill({}), shared)).toBe(true)
  })

  it('aliases OpenClaude to Claude roots without exposing them to other agents', () => {
    const claude = discovery('claude')
    expect(isNativeChatSkillForAgent('claude', skill({}), claude)).toBe(true)
    expect(isNativeChatSkillForAgent('openclaude', skill({}), claude)).toBe(true)
    expect(isNativeChatSkillForAgent('codex', skill({}), claude)).toBe(false)
    expect(isNativeChatSkillForAgent('grok', skill({}), claude)).toBe(false)
  })

  it('grants visibility through any contributing root, not just the dedup survivor', () => {
    const result = {
      sources: [
        {
          id: 'codex-home',
          label: CODEX_HOME_LABEL,
          path: '/Users/test/.codex/skills',
          sourceKind: 'home' as const,
          providers: ['codex' as const],
          owner: 'codex',
          exists: true
        },
        {
          id: 'shared-home',
          label: AGENT_SKILLS_HOME_LABEL,
          path: '/Users/test/.agents/skills',
          sourceKind: 'home' as const,
          providers: ['agent-skills' as const],
          owner: null,
          exists: true
        }
      ]
    } satisfies Pick<SkillDiscoveryResult, 'sources'>
    // A symlinked skill deduped under the Codex root but also reachable
    // through the shared root stays visible to every agent.
    const merged = skill({
      rootPath: '/Users/test/.codex/skills',
      rootPaths: ['/Users/test/.codex/skills', '/Users/test/.agents/skills']
    })
    expect(isNativeChatSkillForAgent('claude', merged, result)).toBe(true)
    expect(isNativeChatSkillForAgent('codex', merged, result)).toBe(true)
    const codexOnly = skill({
      rootPath: '/Users/test/.codex/skills',
      rootPaths: ['/Users/test/.codex/skills']
    })
    expect(isNativeChatSkillForAgent('claude', codexOnly, result)).toBe(false)
  })
})

describe('resolveNativeChatSkillDiscoveryCwd', () => {
  it('returns the owning worktree path for a terminal tab', () => {
    expect(
      resolveNativeChatSkillDiscoveryCwd(
        {
          tabsByWorktree: {
            'repo-1::/repo/worktree': [
              {
                id: 'tab-1'
              }
            ]
          },
          worktreesByRepo: {
            'repo-1': [
              {
                id: 'repo-1::/repo/worktree',
                path: '/repo/worktree'
              }
            ]
          }
        },
        'tab-1'
      )
    ).toBe('/repo/worktree')
  })

  it('returns null when the tab has no known worktree owner', () => {
    expect(
      resolveNativeChatSkillDiscoveryCwd({ tabsByWorktree: {}, worktreesByRepo: {} }, 'tab-1')
    ).toBeNull()
  })

  it('prefers the pane startupCwd over the worktree root', () => {
    expect(
      resolveNativeChatSkillDiscoveryCwd(
        {
          tabsByWorktree: {
            'repo-1::/repo/worktree': [
              { id: 'tab-1', startupCwd: '/repo/worktree/packages/app' },
              { id: 'tab-2' }
            ]
          },
          worktreesByRepo: {
            'repo-1': [{ id: 'repo-1::/repo/worktree', path: '/repo/worktree' }]
          }
        },
        'tab-1'
      )
    ).toBe('/repo/worktree/packages/app')
  })
})

describe('resolveNativeChatSkillDiscoveryContext', () => {
  it('carries the direct SSH owner into local-runtime discovery dispatch', () => {
    const context = resolveNativeChatSkillDiscoveryContext(
      {
        activeRepoId: 'repo-1',
        activeWorktreeId: 'repo-1::/remote/repo',
        folderWorkspaces: [],
        projectGroups: [],
        projects: [],
        repos: [
          {
            id: 'repo-1',
            path: '/remote/repo',
            executionHostId: 'ssh:target-1'
          }
        ],
        restoredRuntimeHostIdByWorkspaceSessionKey: {},
        settings: { activeRuntimeEnvironmentId: null },
        tabsByWorktree: {
          'repo-1::/remote/repo': [{ id: 'tab-1', startupCwd: '/remote/repo/packages/app' }]
        },
        worktreesByRepo: {
          'repo-1': [{ id: 'repo-1::/remote/repo', repoId: 'repo-1', path: '/remote/repo' }]
        }
      } as never,
      'tab-1'
    )

    expect(context).toMatchObject({
      executionHostKind: 'ssh',
      runtimeTarget: { kind: 'local' },
      discoveryTarget: {
        cwd: '/remote/repo/packages/app',
        worktreeId: 'repo-1::/remote/repo',
        executionHostId: 'ssh:target-1'
      }
    })
  })
})
