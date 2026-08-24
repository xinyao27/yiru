import { homedir } from 'node:os'

import { WORKTREE_ID_SEPARATOR } from '@yiru/workbench-model/workspace'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus
} from '~main/project-groups/folder-workspace-path-status'
import { isEphemeralSetupTerminalWorktreeId } from '~shared/ephemeral-setup-terminal-worktree-id'
import { folderWorkspaceToWorktree } from '~shared/folder-workspace-worktree'
import { resolveTerminalStartupCwd } from '~shared/terminal/startup-cwd'
import type { FolderWorkspace } from '~shared/types'
import { folderWorkspaceKey, parseWorkspaceKey } from '~shared/workspace/scope'

import { getExplicitWorktreeIdSelector } from '../model/runtime-limits'
import {
  AGENT_HOOK_RUNTIME_ENV_KEYS,
  WorktreeIdRequiresFullPathError
} from '../model/worktree-resolution'
import type { ResolvedWorktree, TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeSessionMarkRendererReloading } from '../session/mark-renderer-reloading'

export abstract class RuntimeWorktreeResolveFolderWorkspaceLaunchScope extends RuntimeSessionMarkRendererReloading {
  protected async resolveFolderWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope | null> {
    const workspaceSelector = selector.startsWith('id:') ? selector.slice(3) : selector
    const parsed = parseWorkspaceKey(workspaceSelector)
    if (parsed?.type !== 'folder') {
      return null
    }
    const workspace = this.store
      ?.getFolderWorkspaces?.()
      .find((entry) => entry.id === parsed.folderWorkspaceId)
    if (!workspace) {
      throw new Error('selector_not_found')
    }
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const status = await getFolderWorkspacePathStatus(this.store, {
      scope: 'folder-workspace',
      folderWorkspaceId: workspace.id
    })
    assertFolderWorkspacePathUsable(status)
    return {
      id: folderWorkspaceKey(workspace.id),
      path: workspace.folderPath,
      connectionId: null,
      repo: null,
      folderWorkspace: workspace
    }
  }

  protected folderWorkspaceToResolvedWorktree(folderWorkspace: FolderWorkspace): ResolvedWorktree {
    const worktree = folderWorkspaceToWorktree(folderWorkspace)
    return {
      ...worktree,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lineage: null,
      git: {
        path: worktree.path,
        head: worktree.head,
        branch: worktree.branch,
        isBare: worktree.isBare,
        isMainWorktree: worktree.isMainWorktree
      }
    }
  }

  protected resolveWorkspaceTerminalStartupCwd(
    workspace: Pick<TerminalWorkspaceLaunchScope, 'path'>,
    requestedCwd?: string | null
  ): string | undefined {
    return resolveTerminalStartupCwd(workspace.path, requestedCwd)
  }

  protected async resolveTerminalWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope> {
    const workspaceSelector = selector.startsWith('id:') ? selector.slice(3) : selector
    if (isEphemeralSetupTerminalWorktreeId(workspaceSelector)) {
      return {
        id: workspaceSelector,
        path: homedir(),
        connectionId: null,
        repo: null,
        folderWorkspace: null
      }
    }

    const folderScope = await this.resolveFolderWorkspaceLaunchScope(selector)
    if (folderScope) {
      return folderScope
    }

    const parsed = parseWorkspaceKey(workspaceSelector)
    const worktreeSelector = parsed?.type === 'worktree' ? `id:${parsed.worktreeId}` : selector
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store ? (findLocalRepoById(this.store, worktree.repoId) ?? null) : null
    return {
      id: worktree.id,
      path: worktree.path,
      connectionId: repo?.connectionId ?? null,
      repo,
      folderWorkspace: null
    }
  }

  protected buildTerminalWorkspaceEnv(
    scope: TerminalWorkspaceLaunchScope,
    baseEnv: Record<string, string>,
    paneKey: string,
    tabId: string,
    agentTeamsEnv?: Record<string, string>
  ): Record<string, string> {
    const cleanBaseEnv = { ...baseEnv }
    for (const key of AGENT_HOOK_RUNTIME_ENV_KEYS) {
      delete cleanBaseEnv[key]
    }
    const env = {
      ...cleanBaseEnv,
      ...agentTeamsEnv,
      ...this.buildAgentHookPtyEnv?.(),
      YIRU_PANE_KEY: paneKey,
      YIRU_TAB_ID: tabId,
      YIRU_WORKTREE_ID: scope.id
    }
    if (!scope.folderWorkspace) {
      return env
    }
    return {
      ...env,
      YIRU_WORKSPACE_ID: scope.id,
      YIRU_PROJECT_GROUP_ID: scope.folderWorkspace.projectGroupId,
      YIRU_WORKSPACE_ROOT: scope.folderWorkspace.folderPath
    }
  }

  protected getValidatedExplicitWorktreeIdSelector(selector: string | undefined): string | null {
    const worktreeId = getExplicitWorktreeIdSelector(selector)
    if (
      worktreeId &&
      !worktreeId.includes(WORKTREE_ID_SEPARATOR) &&
      this.store?.getRepo(worktreeId)
    ) {
      // Why: registered repo ids are known-invalid worktree ids, so reject them
      // before exact-id fast paths or worktree scans can hide the mistake.
      throw new WorktreeIdRequiresFullPathError()
    }
    return worktreeId
  }
}
