import type { BrowserSlice } from '../components/browser-pane/state'
import type { CoworkingSharingSlice } from '../components/coworking/state'
import type { DictationSlice } from '../components/dictation/state'
import type { DiffCommentsSlice } from '../components/diff-comments/state'
import type { EditorSlice } from '../components/editor/state'
import type { GitHubSlice } from '../components/github/state'
import type { SettingsSlice } from '../components/settings/state'
import type { ClaudeUsageSlice } from '../components/stats/claude-usage'
import type { CodexUsageSlice } from '../components/stats/codex-usage'
import type { OpenCodeUsageSlice } from '../components/stats/opencode-usage'
import type { StatsSlice } from '../components/stats/state'
import type { MemorySlice } from '../components/status-bar/memory-state'
import type { PaneForegroundAgentSlice } from '../components/terminal-pane/pane-foreground-agent-state'
import type { PinnedTabCloseConfirmSlice } from '../components/terminal-pane/pinned-tab-close-confirm-state'
import type { WorkspaceCleanupSlice } from '../components/workspace-cleanup/state'
import type { CommitMessageGenerationSlice } from '../components/workspace-panel/commit-message-generation-state'
import type { GitGraphSlice } from '../components/workspace-panel/git-graph/state'
import type { PullRequestGenerationSlice } from '../components/workspace-panel/pull-request-generation-state'
import type { SourceControlPanelViewSlice } from '../components/workspace-panel/source-control/workspace-panel/state'
import type { WorkspaceSpaceSlice } from '../components/workspace-space/state'
import type { YiruProfilesSlice } from '../components/yiru-profiles/state'
import type { AgentStatusSlice } from './slices/agent-status'
import type { DetectedAgentsSlice } from './slices/detected-agents'
import type { HostedReviewSlice } from './slices/hosted-review'
import type { KeybindingsSlice } from './slices/keybindings'
import type { PreflightSlice } from './slices/preflight'
import type { RateLimitSlice } from './slices/rate-limits'
import type { RecentlyClosedTabsSlice } from './slices/recently-closed-tabs'
import type { RemoteServerUpdatesSlice } from './slices/remote-server-updates'
import type { RepoSlice } from './slices/repos'
import type { RuntimeEnvironmentSshSlice } from './slices/runtime-environment-ssh'
import type { RuntimeStatusSlice } from './slices/runtime-status'
import type { SparsePresetsSlice } from './slices/sparse-presets'
import type { SshSlice } from './slices/ssh'
import type { TabsSlice } from './slices/tabs'
import type { TerminalSlice } from './slices/terminals'
import type { UISlice } from './slices/ui'
import type { WorktreeSlice } from './slices/worktree-helpers'
import type { WorktreeNavHistorySlice } from './slices/worktree-nav-history'

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
      RemoteServerUpdatesSlice,
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
      SourceControlPanelViewSlice,
      GitGraphSlice,
      PinnedTabCloseConfirmSlice,
      RecentlyClosedTabsSlice,
      YiruProfilesSlice,
      CoworkingSharingSlice {}
}
