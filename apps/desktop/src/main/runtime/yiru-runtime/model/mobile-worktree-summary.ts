import type { PtyProviderBufferSnapshot } from '~main/providers/types'
import type { RuntimeWorktreePsSummary } from '~shared/runtime-types'

export function compareWorktreePs(
  left: RuntimeWorktreePsSummary,
  right: RuntimeWorktreePsSummary
): number {
  // Pinned and unread worktrees sort above others so they survive truncation.
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1
  }
  if (left.unread !== right.unread) {
    return left.unread ? -1 : 1
  }
  // Why: worktree.ps is truncated for mobile, so host-visible activity must
  // survive ahead of ordinary inactive rows without displacing pinned/unread.
  if (left.hasHostSidebarActivity !== right.hasHostSidebarActivity) {
    return left.hasHostSidebarActivity ? -1 : 1
  }
  const leftLast = left.lastOutputAt ?? -1
  const rightLast = right.lastOutputAt ?? -1
  if (leftLast !== rightLast) {
    return rightLast - leftLast
  }
  if (left.liveTerminalCount !== right.liveTerminalCount) {
    return right.liveTerminalCount - left.liveTerminalCount
  }
  return left.path.localeCompare(right.path)
}

export const MOBILE_WORKTREE_PREVIEW_MAX_CHARS = 2_048
export const MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS = 512
export const MOBILE_WORKTREE_AGENT_INPUT_MAX_CHARS = 1_024

export function compactWorktreePsForMobile(
  summary: RuntimeWorktreePsSummary
): RuntimeWorktreePsSummary {
  // Why: URLSessionWebSocketTask rejects a single message over 1 MB. Agent hook payloads can
  // contain full tool inputs and terminal previews, while the mobile list only renders a short
  // activity label. Keep the state-bearing fields intact and bound display text before encryption.
  return {
    ...summary,
    preview: clipMobileWorktreeText(summary.preview, MOBILE_WORKTREE_PREVIEW_MAX_CHARS),
    agents: summary.agents.map((agent) => ({
      ...agent,
      prompt: clipMobileWorktreeText(agent.prompt, MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS),
      taskTitle: clipNullableMobileWorktreeText(
        agent.taskTitle,
        MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS
      ),
      displayName: clipNullableMobileWorktreeText(
        agent.displayName,
        MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS
      ),
      lastAssistantMessage: clipNullableMobileWorktreeText(
        agent.lastAssistantMessage,
        MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS
      ),
      toolName: clipNullableMobileWorktreeText(
        agent.toolName,
        MOBILE_WORKTREE_AGENT_TEXT_MAX_CHARS
      ),
      toolInput: clipNullableMobileWorktreeText(
        agent.toolInput,
        MOBILE_WORKTREE_AGENT_INPUT_MAX_CHARS
      )
    }))
  }
}

export function clipNullableMobileWorktreeText(value: string | null, limit: number): string | null {
  return value === null ? null : clipMobileWorktreeText(value, limit)
}

export function clipMobileWorktreeText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value
  }
  const suffix = '…'
  return value.slice(0, Math.max(0, limit - suffix.length)) + suffix
}

export type ProviderTerminalBufferSnapshot = Omit<PtyProviderBufferSnapshot, 'source'> & {
  source: 'provider'
}
