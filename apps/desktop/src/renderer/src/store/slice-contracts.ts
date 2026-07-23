import type { AgentStatusSlice } from './slices/agent-status'
import type { BrowserSlice } from './slices/browser'
import type { ClaudeUsageSlice } from './slices/claude-usage'
import type { CodexUsageSlice } from './slices/codex-usage'
import type { CommitMessageGenerationSlice } from './slices/commit-message-generation'
import type { DetectedAgentsSlice } from './slices/detected-agents'
import type { DictationSlice } from './slices/dictation'
import type { DiffCommentsSlice } from './slices/diff-comments'
import type { EditorSlice } from './slices/editor'
import type { GitHubSlice } from './slices/github'
import type { HostedReviewSlice } from './slices/hosted-review'
import type { KeybindingsSlice } from './slices/keybindings'
import type { MemorySlice } from './slices/memory'
import type { OpenCodeUsageSlice } from './slices/opencode-usage'
import type { PaneForegroundAgentSlice } from './slices/pane-foreground-agent'
import type { PinnedTabCloseConfirmSlice } from './slices/pinned-tab-close-confirm'
import type { PreflightSlice } from './slices/preflight'
import type { PullRequestGenerationSlice } from './slices/pull-request-generation'
import type { RateLimitSlice } from './slices/rate-limits'
import type { RecentlyClosedTabsSlice } from './slices/recently-closed-tabs'
import type { RepoSlice } from './slices/repos'
import type { RuntimeEnvironmentSshSlice } from './slices/runtime-environment-ssh'
import type { RuntimeStatusSlice } from './slices/runtime-status'
import type { SettingsSlice } from './slices/settings'
import type { SparsePresetsSlice } from './slices/sparse-presets'
import type { SpoolSharingSlice } from './slices/spool-sharing'
import type { SshSlice } from './slices/ssh'
import type { StatsSlice } from './slices/stats'
import type { TabsSlice } from './slices/tabs'
import type { TerminalSlice } from './slices/terminals'
import type { UISlice } from './slices/ui'
import type { WorkspaceCleanupSlice } from './slices/workspace-cleanup'
import type { WorkspaceSpaceSlice } from './slices/workspace-space'
import type { WorktreeSlice } from './slices/worktree-helpers'
import type { WorktreeNavHistorySlice } from './slices/worktree-nav-history'
import type { YiruProfilesSlice } from './slices/yiru-profiles'

declare module './types' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- This interface completes the import-free store contract.
  interface AppState
    extends
      RepoSlice,
      SparsePresetsSlice,
      WorktreeSlice,
      TerminalSlice,
      TabsSlice,
      UISlice,
      SettingsSlice,
      KeybindingsSlice,
      GitHubSlice,
      HostedReviewSlice,
      PreflightSlice,
      EditorSlice,
      StatsSlice,
      MemorySlice,
      WorkspaceSpaceSlice,
      ClaudeUsageSlice,
      CodexUsageSlice,
      OpenCodeUsageSlice,
      BrowserSlice,
      RateLimitSlice,
      SshSlice,
      RuntimeEnvironmentSshSlice,
      AgentStatusSlice,
      PaneForegroundAgentSlice,
      DiffCommentsSlice,
      DetectedAgentsSlice,
      WorktreeNavHistorySlice,
      DictationSlice,
      WorkspaceCleanupSlice,
      RuntimeStatusSlice,
      PullRequestGenerationSlice,
      CommitMessageGenerationSlice,
      PinnedTabCloseConfirmSlice,
      RecentlyClosedTabsSlice,
      YiruProfilesSlice,
      SpoolSharingSlice {}
}
