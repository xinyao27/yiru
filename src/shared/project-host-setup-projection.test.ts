import { describe, expect, it } from 'vitest'
import {
  projectHostSetupProjectionFromRepos,
  getProjectHostSetupsForProject,
  getProjectHostSetupWorktreeMeta,
  getPortableProjectIdentityKey,
  isGitHubBackedRepo
} from './project-host-setup-projection'
import type { Repo } from './types'

function repo(overrides: Partial<Repo> & Pick<Repo, 'id' | 'path' | 'displayName'>): Repo {
  return {
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

describe('project host setup projection', () => {
  it('exposes only cross-host-stable Project identities', () => {
    expect(
      getPortableProjectIdentityKey({
        providerIdentity: { provider: 'github', owner: 'PaperBoyTM', repo: 'Yiru' }
      })
    ).toBe('github:paperboytm/yiru')
    expect(
      getPortableProjectIdentityKey({
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/Team/Yiru',
          remoteName: 'origin',
          remoteUrl: 'git@git.company.test:Team/Yiru.git'
        }
      })
    ).toBe('git:git.company.test/Team/Yiru')
    expect(getPortableProjectIdentityKey({})).toBeNull()
  })

  it('projects a legacy local repo into one project and one ready local setup', () => {
    const projection = projectHostSetupProjectionFromRepos(
      [repo({ id: 'repo-1', path: '/Users/alice/yiru', displayName: 'yiru' })],
      500
    )

    expect(projection.projects).toEqual([
      {
        id: 'repo:repo-1',
        displayName: 'yiru',
        badgeColor: '#737373',
        kind: 'git',
        sourceRepoIds: ['repo-1'],
        createdAt: 100,
        updatedAt: 100
      }
    ])
    expect(projection.setups).toEqual([
      {
        id: 'repo-1',
        projectId: 'repo:repo-1',
        hostId: 'local',
        repoId: 'repo-1',
        path: '/Users/alice/yiru',
        displayName: 'yiru',
        kind: 'git',
        setupState: 'ready',
        setupMethod: 'legacy-repo',
        createdAt: 100,
        updatedAt: 100
      }
    ])
  })

  it('preserves host-local setup fields on SSH repos', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'remote-repo',
        path: '/home/alice/yiru',
        displayName: 'yiru',
        connectionId: 'openclaw 2',
        worktreeBasePath: '../worktrees',
        gitUsername: 'alice'
      })
    ])

    expect(projection.setups[0]).toMatchObject({
      id: 'remote-repo',
      hostId: 'ssh:openclaw%202',
      connectionId: 'openclaw 2',
      worktreeBasePath: '../worktrees',
      gitUsername: 'alice'
    })
  })

  it('preserves repo-backed setup method metadata', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'repo-1',
        path: '/Users/alice/yiru',
        displayName: 'yiru',
        projectHostSetupMethod: 'cloned'
      })
    ])

    expect(projection.setups[0]?.setupMethod).toBe('cloned')
  })

  it('groups repo checkouts with the same provider identity under one project', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'local-repo',
        path: '/Users/alice/yiru',
        displayName: 'Yiru',
        upstream: { owner: 'StablyAI', repo: 'Yiru' }
      }),
      repo({
        id: 'remote-repo',
        path: '/home/alice/yiru',
        displayName: 'yiru',
        connectionId: 'gpu-vm',
        upstream: { owner: 'stablyai', repo: 'yiru' }
      })
    ])

    expect(projection.projects).toHaveLength(1)
    expect(projection.projects[0]).toMatchObject({
      id: 'github:stablyai/yiru',
      sourceRepoIds: ['local-repo', 'remote-repo'],
      providerIdentity: { provider: 'github', owner: 'StablyAI', repo: 'Yiru' }
    })
    expect(getProjectHostSetupsForProject(projection.setups, 'github:stablyai/yiru')).toHaveLength(
      2
    )
  })

  it('uses GitHub repo icon metadata as a provider identity fallback', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'local-repo',
        path: '/Users/alice/yiru',
        displayName: 'Yiru',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'stablyai/yiru'
        }
      }),
      repo({
        id: 'remote-repo',
        path: '/home/alice/yiru',
        displayName: 'yiru',
        connectionId: 'gpu-vm',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'StablyAI/Yiru'
        }
      })
    ])

    expect(projection.projects).toHaveLength(1)
    expect(projection.projects[0]).toMatchObject({
      id: 'github:stablyai/yiru',
      sourceRepoIds: ['local-repo', 'remote-repo'],
      providerIdentity: { provider: 'github', owner: 'stablyai', repo: 'yiru' }
    })
    expect(getProjectHostSetupsForProject(projection.setups, 'github:stablyai/yiru')).toHaveLength(
      2
    )
  })

  it('uses git remote identity as a provider identity fallback', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'canonical-local-repo',
        path: '/Users/alice/stably/yiru',
        displayName: 'yiru',
        gitRemoteIdentity: {
          canonicalKey: 'github.com/stablyai/yiru',
          remoteName: 'origin',
          remoteUrl: 'git@github.com:stablyai/yiru.git'
        }
      }),
      repo({
        id: 'old-branch-checkout',
        path: '/Users/alice/yiru/workspaces/yiru/re-enable-webgl-for-remote-runtime-terminals',
        displayName: 're-enable-webgl-for-remote-runtime-terminals',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/stablyai.png?size=64',
          source: 'github',
          label: 'stablyai/yiru'
        }
      })
    ])

    expect(projection.projects).toHaveLength(1)
    expect(projection.projects[0]).toMatchObject({
      id: 'github:stablyai/yiru',
      displayName: 'yiru',
      sourceRepoIds: ['canonical-local-repo', 'old-branch-checkout'],
      providerIdentity: { provider: 'github', owner: 'stablyai', repo: 'yiru' }
    })
  })

  it('does not guess that same-named folders are the same project without identity', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({ id: 'local-repo', path: '/Users/alice/app', displayName: 'app' }),
      repo({
        id: 'remote-repo',
        path: '/srv/app',
        displayName: 'app',
        connectionId: 'work-server'
      })
    ])

    expect(projection.projects.map((project) => project.id)).toEqual([
      'repo:local-repo',
      'repo:remote-repo'
    ])
  })

  it('groups same-project records across local, SSH, and runtime hosts by git remote identity', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'local-sample-app',
        path: '/Users/alice/work/sample-app',
        displayName: 'sample-app',
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/team/sample-app',
          remoteName: 'origin',
          remoteUrl: 'git@git.company.test:team/sample-app.git'
        }
      }),
      repo({
        id: 'ssh-sample-app',
        path: '/home/alice/src/sample-app',
        displayName: 'sample-app',
        connectionId: 'build server',
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/team/sample-app',
          remoteName: 'origin',
          remoteUrl: 'https://git.company.test/team/sample-app.git'
        }
      }),
      repo({
        id: 'runtime-sample-app',
        path: '/workspace/sample-app',
        displayName: 'sample-app',
        executionHostId: 'runtime:dev-container',
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/team/sample-app',
          remoteName: 'origin',
          remoteUrl: 'ssh://git@git.company.test/team/sample-app.git'
        }
      })
    ])

    expect(projection.projects).toHaveLength(1)
    expect(projection.projects[0]).toMatchObject({
      id: 'git:git.company.test/team/sample-app',
      displayName: 'sample-app',
      sourceRepoIds: ['local-sample-app', 'ssh-sample-app', 'runtime-sample-app'],
      gitRemoteIdentity: {
        canonicalKey: 'git.company.test/team/sample-app',
        remoteName: 'origin'
      }
    })
    expect(projection.setups.map((setup) => setup.hostId)).toEqual([
      'local',
      'ssh:build%20server',
      'runtime:dev-container'
    ])
    expect(
      getProjectHostSetupsForProject(projection.setups, 'git:git.company.test/team/sample-app')
    ).toHaveLength(3)
  })

  it('keeps same-named cross-host records separate when there is no shared repo identity', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'local-sample-app',
        path: '/Users/alice/work/sample-app',
        displayName: 'sample-app'
      }),
      repo({
        id: 'ssh-sample-app',
        path: '/srv/unrelated/sample-app',
        displayName: 'sample-app',
        connectionId: 'staging server'
      }),
      repo({
        id: 'runtime-sample-app',
        path: '/workspace/sample-app',
        displayName: 'sample-app',
        executionHostId: 'runtime:preview'
      })
    ])

    // Why: display names are labels, not identity. A future fix needs a
    // normalized git remote identity or an explicit user link before merging.
    expect(projection.projects).toHaveLength(3)
  })

  it('does not collapse case-distinct remote paths for self-hosted git remotes', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'uppercase-repo',
        path: '/Users/alice/work/sample-app',
        displayName: 'sample-app',
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/Team/Sample-App',
          remoteName: 'origin',
          remoteUrl: 'git@git.company.test:Team/Sample-App.git'
        }
      }),
      repo({
        id: 'lowercase-repo',
        path: '/home/alice/src/sample-app',
        displayName: 'sample-app',
        connectionId: 'build server',
        gitRemoteIdentity: {
          canonicalKey: 'git.company.test/team/sample-app',
          remoteName: 'origin',
          remoteUrl: 'git@git.company.test:team/sample-app.git'
        }
      })
    ])

    expect(projection.projects.map((project) => project.id)).toEqual([
      'git:git.company.test/Team/Sample-App',
      'git:git.company.test/team/sample-app'
    ])
  })

  it('ignores malformed provider identity values', () => {
    const projection = projectHostSetupProjectionFromRepos([
      repo({
        id: 'repo-1',
        path: '/Users/alice/yiru',
        displayName: 'yiru',
        upstream: { owner: 'stablyai', repo: 42 } as never
      })
    ])

    expect(projection.projects[0]?.id).toBe('repo:repo-1')
    expect(projection.projects[0]?.providerIdentity).toBeUndefined()
  })

  it('derives workspace ownership metadata from the repo setup', () => {
    const targetRepo = repo({
      id: 'remote-repo',
      path: '/home/alice/yiru',
      displayName: 'yiru',
      connectionId: 'openclaw 2',
      upstream: { owner: 'stablyai', repo: 'yiru' }
    })
    const projection = projectHostSetupProjectionFromRepos([targetRepo])

    expect(getProjectHostSetupWorktreeMeta(projection.setups, targetRepo)).toEqual({
      projectId: 'github:stablyai/yiru',
      hostId: 'ssh:openclaw%202',
      projectHostSetupId: 'remote-repo'
    })
  })
})

describe('isGitHubBackedRepo', () => {
  it('is true when an explicit upstream owner/repo is present', () => {
    const target = repo({
      id: 'r',
      path: '/r',
      displayName: 'r',
      upstream: { owner: 'stablyai', repo: 'yiru' }
    })
    expect(isGitHubBackedRepo(target)).toBe(true)
  })

  it('is true when a GitHub-sourced avatar icon encodes the slug', () => {
    const target = repo({
      id: 'r',
      path: '/r',
      displayName: 'r',
      repoIcon: {
        type: 'image',
        src: 'https://github.com/stablyai.png?size=64',
        source: 'github',
        label: 'stablyai/yiru'
      }
    })
    expect(isGitHubBackedRepo(target)).toBe(true)
  })

  it('is false for a non-GitHub icon and no upstream (GitLab/folder)', () => {
    const target = repo({
      id: 'r',
      path: '/r',
      displayName: 'r',
      repoIcon: { type: 'lucide', name: 'gitlab' }
    })
    expect(isGitHubBackedRepo(target)).toBe(false)
  })

  it('is false for a plain local repo with no provider signal', () => {
    expect(isGitHubBackedRepo(repo({ id: 'r', path: '/r', displayName: 'r' }))).toBe(false)
  })
})
