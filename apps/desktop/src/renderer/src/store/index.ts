import { create } from 'zustand'

import { registerHttpLinkStoreAccessor } from '@/lib/http-link-routing'
import {
  registerRendererMemoryProfileContributor,
  summarizeStateCollectionSizes
} from '@/lib/renderer-memory-profile'

import { createBrowserSlice } from '../components/browser-pane/state'
import { createDictationSlice } from '../components/dictation/state'
import { createDiffCommentsSlice } from '../components/diff-comments/state'
import { createEditorSlice } from '../components/editor/state'
import { createGitHubSlice } from '../components/github/state'
import { createSettingsSlice } from '../components/settings/state'
import { createSpoolSharingSlice } from '../components/spool/state'
import { createClaudeUsageSlice } from '../components/stats/claude-usage'
import { createCodexUsageSlice } from '../components/stats/codex-usage'
import { createOpenCodeUsageSlice } from '../components/stats/opencode-usage'
import { createStatsSlice } from '../components/stats/state'
import { createMemorySlice } from '../components/status-bar/memory-state'
import { createPaneForegroundAgentSlice } from '../components/terminal-pane/pane-foreground-agent-state'
import { createPinnedTabCloseConfirmSlice } from '../components/terminal-pane/pinned-tab-close-confirm-state'
import { createWorkspaceCleanupSlice } from '../components/workspace-cleanup/state'
import { createCommitMessageGenerationSlice } from '../components/workspace-panel/commit-message-generation-state'
import { createPullRequestGenerationSlice } from '../components/workspace-panel/pull-request-generation-state'
import { createWorkspaceSpaceSlice } from '../components/workspace-space/state'
import { createYiruProfilesSlice } from '../components/yiru-profiles/state'
import './slice-contracts'
import { createAgentStatusSlice } from './slices/agent-status'
import { createDetectedAgentsSlice } from './slices/detected-agents'
import { createHostedReviewSlice } from './slices/hosted-review'
import { createKeybindingsSlice } from './slices/keybindings'
import { createPreflightSlice } from './slices/preflight'
import { createRateLimitSlice } from './slices/rate-limits'
import { createRecentlyClosedTabsSlice } from './slices/recently-closed-tabs'
import { createRemoteServerUpdatesSlice } from './slices/remote-server-updates'
import { createRepoSlice } from './slices/repos'
import { createRuntimeEnvironmentSshSlice } from './slices/runtime-environment-ssh'
import { createRuntimeStatusSlice } from './slices/runtime-status'
import { createSparsePresetsSlice } from './slices/sparse-presets'
import { createSshSlice } from './slices/ssh'
import { createTabsSlice } from './slices/tabs'
import { createTerminalSlice } from './slices/terminals'
import { createUISlice } from './slices/ui'
import { createWorktreeNavHistorySlice } from './slices/worktree-nav-history'
import { createWorktreeSlice } from './slices/worktrees'
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
  ...createRemoteServerUpdatesSlice(...a),
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

// Why: high-water breadcrumbs need to identify the store collections that grew
// without retaining raw state in a crash report.
registerRendererMemoryProfileContributor('store', () =>
  summarizeStateCollectionSizes(useAppStore.getState(), 20)
)

export type { AppState } from './types'

// Why: expose the store for interactive development diagnostics.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__store = useAppStore
}
