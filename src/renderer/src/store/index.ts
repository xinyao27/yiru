import { create } from 'zustand'
import type { AppState } from './types'
import { createRepoSlice } from './slices/repos'
import { createSparsePresetsSlice } from './slices/sparse-presets'
import { createWorktreeSlice } from './slices/worktrees'
import { createTerminalSlice } from './slices/terminals'
import { createTabsSlice } from './slices/tabs'
import { createUISlice } from './slices/ui'
import { createSettingsSlice } from './slices/settings'
import { createKeybindingsSlice } from './slices/keybindings'
import { createGitHubSlice } from './slices/github'
import { createHostedReviewSlice } from './slices/hosted-review'
import { createPreflightSlice } from './slices/preflight'
import { createEditorSlice } from './slices/editor'
import { createStatsSlice } from './slices/stats'
import { createMemorySlice } from './slices/memory'
import { createWorkspaceSpaceSlice } from './slices/workspace-space'
import { createClaudeUsageSlice } from './slices/claude-usage'
import { createCodexUsageSlice } from './slices/codex-usage'
import { createOpenCodeUsageSlice } from './slices/opencode-usage'
import { createBrowserSlice } from './slices/browser'
import { createRateLimitSlice } from './slices/rate-limits'
import { createSshSlice } from './slices/ssh'
import { createRuntimeEnvironmentSshSlice } from './slices/runtime-environment-ssh'
import { createAgentStatusSlice } from './slices/agent-status'
import { createPaneForegroundAgentSlice } from './slices/pane-foreground-agent'
import { createDiffCommentsSlice } from './slices/diff-comments'
import { createDetectedAgentsSlice } from './slices/detected-agents'
import { createWorktreeNavHistorySlice } from './slices/worktree-nav-history'
import { createDictationSlice } from './slices/dictation'
import { createWorkspaceCleanupSlice } from './slices/workspace-cleanup'
import { createRuntimeStatusSlice } from './slices/runtime-status'
import { createPullRequestGenerationSlice } from './slices/pull-request-generation'
import { createCommitMessageGenerationSlice } from './slices/commit-message-generation'
import { createPinnedTabCloseConfirmSlice } from './slices/pinned-tab-close-confirm'
import { createRecentlyClosedTabsSlice } from './slices/recently-closed-tabs'
import { createYiruProfilesSlice } from './slices/yiru-profiles'
import { createSpoolSharingSlice } from './slices/spool-sharing'
import { registerHttpLinkStoreAccessor } from '@/lib/http-link-routing'

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
