import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { invalidateAuthorizedRootsCache } from '~main/filesystem/auth'
import { enrichMissingRepoGitRemoteIdentities } from '~main/repo-git-remote-identity-enrichment'
import { prepareLocalWorktreeRootForRepo } from '~main/worktree-root-preparation'
import { getProjectHostSetupForRepo } from '~shared/project-host-setup-projection'
import type {
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCloneArgs,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  Repo,
  ProjectGroup,
  FolderWorkspace
} from '~shared/types'

import { RuntimeTerminalAttachAgentRowsToSummaries } from '../terminal/attach-agent-rows-to-summaries'

export abstract class RuntimeRepositoryListRepos extends RuntimeTerminalAttachAgentRowsToSummaries {
  listRepos(): Repo[] {
    return (this.store?.getRepos() ?? []).filter(
      (repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
    )
  }

  enrichMissingRepoGitRemoteIdentities(): void {
    if (!this.store) {
      return
    }
    enrichMissingRepoGitRemoteIdentities(this.store, {
      onChanged: () => {
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
      }
    })
  }

  listProjects(): Project[] {
    return this.store?.getProjects?.() ?? []
  }

  updateProject(projectId: string, updates: ProjectUpdateArgs['updates']): Project {
    if (!this.store?.updateProject) {
      throw new Error('runtime_unavailable')
    }
    const project = this.store.updateProject(projectId, updates)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    this.invalidateResolvedWorktreeCache()
    this.notifyReposChanged()
    return project
  }

  listProjectHostSetups(): ProjectHostSetup[] {
    return this.store?.getProjectHostSetups?.() ?? []
  }

  createProjectHostSetup(args: ProjectHostSetupCreateArgs): ProjectHostSetupCreateResult {
    if (!this.store?.createProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.createProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project not found: ${args.projectId}`)
    }
    return result
  }

  async setupProjectExistingFolder(
    args: ProjectHostSetupExistingFolderArgs
  ): Promise<ProjectHostSetupResult> {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    let repo = await this.addRepo(args.path, args.kind === 'folder' ? 'folder' : 'git', args.hostId)
    let setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    if (setup.projectId !== args.projectId) {
      const existingProject = this.listProjects().find((project) => project.id === args.projectId)
      if (
        !existingProject?.providerIdentity ||
        existingProject.providerIdentity.provider !== 'github'
      ) {
        throw new Error('Imported folder does not match the selected project identity.')
      }
      const updated = this.store.updateRepo(repo.id, {
        upstream: {
          owner: existingProject.providerIdentity.owner,
          repo: existingProject.providerIdentity.repo
        }
      })
      if (!updated) {
        throw new Error(`Project setup repo disappeared before it could be linked: ${repo.id}`)
      }
      repo = updated
      setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    }
    const setupMethod = args.setupMethod ?? 'imported-existing-folder'
    const updated = this.store.updateRepo(repo.id, { projectHostSetupMethod: setupMethod })
    if (!updated) {
      throw new Error(
        `Project setup repo disappeared before setup metadata could be linked: ${repo.id}`
      )
    }
    repo = updated
    setup = getProjectHostSetupForRepo(this.listProjectHostSetups(), repo)
    const project = this.listProjects().find((entry) => entry.id === setup.projectId)
    if (!project) {
      throw new Error(`Project setup was created without a project record: ${setup.projectId}`)
    }
    return { project, setup, repo }
  }

  async setupProjectClone(args: ProjectHostSetupCloneArgs): Promise<ProjectHostSetupResult> {
    const repo = await this.cloneRepo(args.url, args.destination, args.hostId)
    return await this.setupProjectExistingFolder({
      projectId: args.projectId,
      hostId: args.hostId,
      path: repo.path,
      kind: 'git',
      displayName: args.displayName,
      setupMethod: 'cloned'
    })
  }

  updateProjectHostSetup(args: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult {
    if (!this.store?.updateProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.updateProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project host setup not found: ${args.setupId}`)
    }
    if ('worktreeBasePath' in args.updates && result.repo) {
      void prepareLocalWorktreeRootForRepo(this.store, result.repo)
      invalidateAuthorizedRootsCache()
    }
    return result
  }

  deleteProjectHostSetup(args: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult {
    if (!this.store?.deleteProjectHostSetup) {
      throw new Error('runtime_unavailable')
    }
    const result = this.store.deleteProjectHostSetup(args)
    if (!result) {
      throw new Error(`Project host setup not found: ${args.setupId}`)
    }
    return result
  }

  listProjectGroups(): ProjectGroup[] {
    return this.store?.getProjectGroups?.() ?? []
  }

  listFolderWorkspaces(): FolderWorkspace[] {
    return this.store?.getFolderWorkspaces?.() ?? []
  }

  async createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom?: ProjectGroup['createdFrom']
  }): Promise<ProjectGroup> {
    if (!this.store?.createProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const group = this.store.createProjectGroup({
      name: input.name,
      parentPath: input.parentPath ?? null,
      connectionId: input.connectionId ?? null,
      parentGroupId: input.parentGroupId ?? null,
      createdFrom: input.createdFrom ?? 'manual'
    })
    this.notifyReposChanged()
    return group
  }

  async updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): Promise<ProjectGroup | null> {
    if (!this.store?.updateProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const updated = this.store.updateProjectGroup(groupId, updates)
    if (updated) {
      this.notifyReposChanged()
    }
    return updated
  }

  async deleteProjectGroup(groupId: string): Promise<{ deleted: boolean }> {
    if (!this.store?.deleteProjectGroup) {
      throw new Error('runtime_unavailable')
    }
    const deleted = this.store.deleteProjectGroup(groupId)
    if (deleted) {
      this.notifyReposChanged()
    }
    return { deleted }
  }
}
