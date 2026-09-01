import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { Repo } from '@yiru/runtime-protocol/workbench/types'
import { getLocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import {
  readMobileMarkdownViaShell,
  saveMobileMarkdownViaShell
} from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import type { ResolvedWorktree } from '../model/worktree-resolution'
import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeSessionSplitHeadlessMobileSessionTabGroup } from './split-headless-mobile-session-tab-group'

export abstract class RuntimeSessionResolveMobileSessionHostTabId extends RuntimeSessionSplitHeadlessMobileSessionTabGroup {
  protected resolveMobileSessionHostTabId(
    snapshot: RuntimeMobileSessionTabsSnapshot | undefined,
    tabId: string
  ): string | null {
    const tab =
      snapshot?.tabs.find((candidate) => candidate.id === tabId) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'terminal' && candidate.parentTabId === tabId
      ) ??
      snapshot?.tabs.find(
        (candidate) => candidate.type === 'browser' && candidate.browserWorkspaceId === tabId
      )
    if (!tab) {
      return null
    }
    return tab.type === 'terminal' ? tab.parentTabId : tab.id
  }

  async readMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string
  ): Promise<RuntimeMarkdownReadTabResult> {
    const worktreeId = await this.resolveMobileMarkdownWorktreeId(worktreeSelector, tabId)
    if (!this.shellConnectionId) {
      throw new Error('renderer_unavailable')
    }
    const result = await readMobileMarkdownViaShell(this.shellConnectionId, {
      worktreeId,
      tabId
    })
    if (!result.ok) {
      throw new Error('renderer_unavailable')
    }
    const { ok: _ok, ...output } = result
    return output
  }

  async saveMobileMarkdownTab(
    worktreeSelector: string,
    tabId: string,
    baseVersion: string,
    content: string
  ): Promise<RuntimeMarkdownSaveTabResult> {
    const worktreeId = await this.resolveMobileMarkdownWorktreeId(worktreeSelector, tabId)
    if (!this.shellConnectionId) {
      throw new Error('renderer_unavailable')
    }
    const result = await saveMobileMarkdownViaShell(this.shellConnectionId, {
      worktreeId,
      tabId,
      baseVersion,
      content
    })
    if (!result.ok) {
      throw new Error('renderer_unavailable')
    }
    const { ok: _ok, ...output } = result
    return output
  }

  protected async resolveRuntimeGitTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
    repo?: Repo
    localGitOptions?: { wslDistro?: string }
  }> {
    const store = this.requireStore()
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = findLocalRepoById(store, worktree.repoId)
    const localGitOptions = repo ? getLocalProjectWorktreeGitOptions(store, repo) : {}
    return { worktree, repo, localGitOptions }
  }

  protected async resolveRuntimeFileTarget(worktreeSelector: string): Promise<{
    worktree: ResolvedWorktree
  }> {
    const folderScope = await this.resolveFolderWorkspaceLaunchScope(worktreeSelector)
    if (folderScope?.folderWorkspace) {
      return {
        worktree: this.folderWorkspaceToResolvedWorktree(folderScope.folderWorkspace)
      }
    }

    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    return { worktree }
  }

  onMobileSessionTabsChanged(
    listener: (snapshot: RuntimeMobileSessionTabsResult) => void
  ): () => void {
    this.mobileSessionTabListeners.add(listener)
    return () => {
      // Why: flush pending coalesced notifies before dropping this listener so a
      // subscriber closing mid-window still receives the latest settled state.
      this.mobileSessionTabsNotifyCoalescer.flushAll()
      this.mobileSessionTabListeners.delete(listener)
    }
  }

  // Why: terminal handles are normally created lazily when first referenced via
  // RPC, but agents need their own handle at spawn time (via YIRU_TERMINAL_HANDLE
  // env var) so they can self-identify in orchestration messages without an
  // extra RPC round-trip. Pre-allocating by ptyId lets issueHandle reuse it.
}
