import { localCalendarDayKey } from '@yiru/workbench-model/ui'

import type { ProviderUsageSnapshot, ProviderUsageWidgetProps } from '../../widgets/provider-usage'
import type { TokenUsageWidgetProps } from '../../widgets/token-usage'
import type {
  RunningWorkspaceSnapshot,
  WorkspaceStatusWidgetProps
} from '../../widgets/workspace-status'
import type { HomeSnapshot } from '../cache/home-snapshot-cache'
import {
  getActiveProviderRateLimits,
  type ProviderKey,
  type ProviderRateLimits
} from '../components/account-usage'
import { aggregateHomeStats } from '../home/stats-summary'
import { translate } from '../i18n/translate'

type ProviderSource = {
  hostId: string
  limits: ProviderRateLimits | null
}

let pendingSnapshot: HomeSnapshot | null = null
let updateTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleWidgetSnapshotUpdate(snapshot: HomeSnapshot): void {
  pendingSnapshot = snapshot
  if (updateTimer) {
    clearTimeout(updateTimer)
  }
  updateTimer = setTimeout(() => {
    updateTimer = null
    const nextSnapshot = pendingSnapshot
    pendingSnapshot = null
    if (nextSnapshot) {
      void updateWidgetSnapshots(nextSnapshot)
    }
  }, 250)
}

async function updateWidgetSnapshots(snapshot: HomeSnapshot): Promise<void> {
  try {
    const [providerWidgets, { default: workspaceWidget }, { default: tokenWidget }] =
      await Promise.all([
        import('../../widgets/provider-usage'),
        import('../../widgets/workspace-status'),
        import('../../widgets/token-usage')
      ])
    const providerProps = buildProviderProps(snapshot)
    providerWidgets.default.updateSnapshot(providerProps)
    providerWidgets.claudeUsageWidget.updateSnapshot(providerProps)
    workspaceWidget.updateSnapshot(buildWorkspaceProps(snapshot))
    tokenWidget.updateSnapshot(buildTokenProps(snapshot))
  } catch (error) {
    console.warn('[widgets] Could not update widget snapshots', error)
  }
}

function buildProviderProps(snapshot: HomeSnapshot): ProviderUsageWidgetProps {
  return {
    claude: buildProviderSnapshot(snapshot, 'claude'),
    codex: buildProviderSnapshot(snapshot, 'codex'),
    sessionLabel: translate('mobile.widgets.provider.session', '5h'),
    unavailableLabel: translate('mobile.widgets.unavailable', '—'),
    usedLabel: translate('mobile.widgets.provider.used', 'Used'),
    weeklyLabel: translate('mobile.widgets.provider.weekly', 'Weekly')
  }
}

function buildProviderSnapshot(
  snapshot: HomeSnapshot,
  provider: ProviderKey
): ProviderUsageSnapshot {
  const source = selectProviderSource(snapshot.accountsByHost, provider)
  const limits = source?.limits ?? null
  return {
    name:
      provider === 'claude'
        ? translate('mobile.widgets.provider.claude', 'Claude')
        : translate('mobile.widgets.provider.chatgpt', 'ChatGPT'),
    openUrl: source ? `yiru:///h/${encodeURIComponent(source.hostId)}/accounts` : 'yiru:///',
    sessionUsedPercent: limits?.session?.usedPercent ?? -1,
    updatedLabel: formatCompactAge(limits?.updatedAt ?? 0, snapshot.savedAt),
    weeklyResetLabel: formatCompactCountdown(limits?.weekly?.resetsAt ?? 0, snapshot.savedAt),
    weeklyUsedPercent: limits?.weekly?.usedPercent ?? -1
  }
}

function selectProviderSource(
  accountsByHost: HomeSnapshot['accountsByHost'],
  provider: ProviderKey
): ProviderSource | null {
  let selected: ProviderSource | null = null
  for (const [hostId, snapshot] of Object.entries(accountsByHost)) {
    const limits = getActiveProviderRateLimits(snapshot, provider)
    if (!selected || (limits?.updatedAt ?? 0) > (selected.limits?.updatedAt ?? 0)) {
      selected = { hostId, limits }
    }
  }
  return selected
}

function buildWorkspaceProps(snapshot: HomeSnapshot): WorkspaceStatusWidgetProps {
  const running = collectRunningWorkspaces(snapshot)
  const first = running[0] ?? null
  const activeCount = Object.values(snapshot.worktreeInfo).reduce(
    (total, info) => total + info.activeCount,
    0
  )
  const totalWorkspaces = Object.values(snapshot.worktreeInfo).reduce(
    (total, info) => total + info.totalWorktrees,
    0
  )
  const attentionCount = Object.values(snapshot.worktreeInfo).reduce(
    (total, info) => total + (info.attentionCount ?? 0),
    0
  )
  const emptyWorkspace = buildEmptyWorkspace()
  return {
    activeCount,
    attentionCount,
    emptyLabel: translate('mobile.widgets.workspace.empty', 'Idle'),
    hasPrimaryWorkspace: first !== null,
    openUrl: first ? `yiru:///h/${encodeURIComponent(first.hostId)}` : 'yiru:///',
    primaryWorkspace: first?.widget ?? emptyWorkspace,
    runningLabel: translate('mobile.widgets.workspace.running', 'Running'),
    totalLabel: translate('mobile.widgets.workspace.total', 'Total'),
    totalWorkspaces,
    updatedLabel: formatCompactAge(snapshot.savedAt, Date.now()),
    waitingLabel: translate('mobile.widgets.workspace.waiting', 'Needs input')
  }
}

function buildEmptyWorkspace(): RunningWorkspaceSnapshot {
  return {
    contextLabel: '',
    displayName: '',
    status: 'active',
    statusLabel: ''
  }
}

function collectRunningWorkspaces(snapshot: HomeSnapshot): {
  hostId: string
  widget: RunningWorkspaceSnapshot
}[] {
  const running: { hostId: string; widget: RunningWorkspaceSnapshot }[] = []
  const seen = new Set<string>()
  for (const [hostId, info] of Object.entries(snapshot.worktreeInfo)) {
    const candidates =
      info.activeWorktrees ?? (info.lastActiveWorktree ? [info.lastActiveWorktree] : [])
    for (const worktree of candidates) {
      if (seen.has(worktree.worktreeId)) {
        continue
      }
      const status = normalizeRunningStatus(worktree.status)
      if (!status) {
        continue
      }
      seen.add(worktree.worktreeId)
      running.push({
        hostId,
        widget: {
          contextLabel: `${worktree.repo} · ${worktree.branch}`,
          displayName: worktree.displayName,
          status,
          statusLabel: workspaceStatusLabel(status)
        }
      })
    }
  }
  return running.sort(
    (left, right) => statusRank(left.widget.status) - statusRank(right.widget.status)
  )
}

function normalizeRunningStatus(
  status: 'active' | 'done' | 'inactive' | 'permission' | 'working' | undefined
): RunningWorkspaceSnapshot['status'] | null {
  return status === 'active' || status === 'permission' || status === 'working' ? status : null
}

function workspaceStatusLabel(status: RunningWorkspaceSnapshot['status']): string {
  switch (status) {
    case 'active':
      return translate('mobile.widgets.workspace.active', 'Active')
    case 'permission':
      return translate('mobile.widgets.workspace.permission', 'Needs input')
    case 'working':
      return translate('mobile.widgets.workspace.working', 'Working')
  }
}

function statusRank(status: RunningWorkspaceSnapshot['status']): number {
  switch (status) {
    case 'permission':
      return 0
    case 'working':
      return 1
    case 'active':
      return 2
  }
}

function buildTokenProps(snapshot: HomeSnapshot): TokenUsageWidgetProps {
  const summary = aggregateHomeStats(snapshot.statsByHost ?? {})
  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const todayKey = localCalendarDayKey(today)
  const weekStartKey = localCalendarDayKey(weekStart)
  const todayTokens = summary?.dailyTokens?.find((point) => point.day === todayKey)?.tokens ?? 0
  const todayValue = summary?.dailyValues?.find((point) => point.day === todayKey)?.valueUsd ?? 0
  const weekTokens = (summary?.dailyTokens ?? [])
    .filter((point) => point.day >= weekStartKey && point.day <= todayKey)
    .reduce((total, point) => total + point.tokens, 0)
  const weekValue = (summary?.dailyValues ?? [])
    .filter((point) => point.day >= weekStartKey && point.day <= todayKey)
    .reduce((total, point) => total + point.valueUsd, 0)
  return {
    openUrl: 'yiru:///activity-insights',
    thisWeekLabel: translate('mobile.widgets.tokens.thisWeek', 'Week'),
    todayLabel: translate('mobile.widgets.tokens.today', 'Today'),
    todayTokens,
    todayTokensLabel: formatTokenCount(todayTokens),
    todayValueLabel: formatUsd(todayValue),
    updatedLabel: formatCompactAge(snapshot.savedAt, Date.now()),
    weekTokens,
    weekTokensLabel: formatTokenCount(weekTokens),
    weekValueLabel: formatUsd(weekValue)
  }
}

function formatTokenCount(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function formatUsd(value: number): string {
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function formatCompactAge(timestamp: number, now: number): string {
  return timestamp <= 0 ? '—' : formatCompactDuration(now - timestamp)
}

function formatCompactCountdown(timestamp: number, now: number): string {
  return timestamp <= 0 ? '—' : formatCompactDuration(timestamp - now)
}

function formatCompactDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1_000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}
