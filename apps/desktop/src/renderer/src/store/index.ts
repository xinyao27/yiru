import { create } from 'zustand'

import { registerHttpLinkStoreAccessor } from '@/lib/http-link-routing'

import './slice-contracts'
import { createAgentStatusSlice } from './slices/agent-status'
import { createBrowserSlice } from './slices/browser'
import { createClaudeUsageSlice } from './slices/claude-usage'
import { createCodexUsageSlice } from './slices/codex-usage'
import { createCommitMessageGenerationSlice } from './slices/commit-message-generation'
import { createDetectedAgentsSlice } from './slices/detected-agents'
import { createDictationSlice } from './slices/dictation'
import { createDiffCommentsSlice } from './slices/diff-comments'
import { createEditorSlice } from './slices/editor'
import { createGitHubSlice } from './slices/github'
import { createHostedReviewSlice } from './slices/hosted-review'
import { createKeybindingsSlice } from './slices/keybindings'
import { createMemorySlice } from './slices/memory'
import { createOpenCodeUsageSlice } from './slices/opencode-usage'
import { createPaneForegroundAgentSlice } from './slices/pane-foreground-agent'
import { createPinnedTabCloseConfirmSlice } from './slices/pinned-tab-close-confirm'
import { createPreflightSlice } from './slices/preflight'
import { createPullRequestGenerationSlice } from './slices/pull-request-generation'
import { createRateLimitSlice } from './slices/rate-limits'
import { createRecentlyClosedTabsSlice } from './slices/recently-closed-tabs'
import { createRepoSlice } from './slices/repos'
import { createRuntimeEnvironmentSshSlice } from './slices/runtime-environment-ssh'
import { createRuntimeStatusSlice } from './slices/runtime-status'
import { createSettingsSlice } from './slices/settings'
import { createSparsePresetsSlice } from './slices/sparse-presets'
import { createSpoolSharingSlice } from './slices/spool-sharing'
import { createSshSlice } from './slices/ssh'
import { createStatsSlice } from './slices/stats'
import { createTabsSlice } from './slices/tabs'
import { createTerminalSlice } from './slices/terminals'
import { createUISlice } from './slices/ui'
import { createWorkspaceCleanupSlice } from './slices/workspace-cleanup'
import { createWorkspaceSpaceSlice } from './slices/workspace-space'
import { createWorktreeNavHistorySlice } from './slices/worktree-nav-history'
import { createWorktreeSlice } from './slices/worktrees'
import { createYiruProfilesSlice } from './slices/yiru-profiles'
import type { AppState } from './types'

export const useAppStore = create<AppState>()((...a) => ({
  ...createRepoSlice(...a),
  ...createSparsePresetsSlice(...a),
  ...createWorktreeSlice(...a),
  ...createTerminalSlice(...a),
  ...createTabsSlice(...a),
  ...createUISlice(...a),
  ...createSettingsSlice(...a),
  ...createKeybindingsSlice(...a),
  ...createGitHubSlice(...a),
  ...createHostedReviewSlice(...a),
  ...createPreflightSlice(...a),
  ...createEditorSlice(...a),
  ...createStatsSlice(...a),
  ...createMemorySlice(...a),
  ...createWorkspaceSpaceSlice(...a),
  ...createClaudeUsageSlice(...a),
  ...createCodexUsageSlice(...a),
  ...createOpenCodeUsageSlice(...a),
  ...createBrowserSlice(...a),
  ...createRateLimitSlice(...a),
  ...createSshSlice(...a),
  ...createRuntimeEnvironmentSshSlice(...a),
  ...createAgentStatusSlice(...a),
  ...createPaneForegroundAgentSlice(...a),
  ...createDiffCommentsSlice(...a),
  ...createDetectedAgentsSlice(...a),
  ...createWorktreeNavHistorySlice(...a),
  ...createDictationSlice(...a),
  ...createWorkspaceCleanupSlice(...a),
  ...createRuntimeStatusSlice(...a),
  ...createPullRequestGenerationSlice(...a),
  ...createCommitMessageGenerationSlice(...a),
  ...createPinnedTabCloseConfirmSlice(...a),
  ...createRecentlyClosedTabsSlice(...a),
  ...createYiruProfilesSlice(...a),
  ...createSpoolSharingSlice(...a)
}))

registerHttpLinkStoreAccessor(() => useAppStore.getState())

export type { AppState } from './types'

// Why: expose the store for interactive development diagnostics.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__store = useAppStore
}
