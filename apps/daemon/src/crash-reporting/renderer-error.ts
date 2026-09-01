import { arch, release } from 'node:os'

import type {
  RendererErrorReportArgs,
  RendererErrorReportResult
} from '@yiru/runtime-protocol/workbench/crash-reporting'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { getCrashBreadcrumbSnapshot } from './crash-breadcrumb-store'
import type { CrashReportStore } from './store'

const recentReportKeys = new Map<string, number>()
const DEDUPE_MS = 10 * 60 * 1000
const MAX_KEY_AGE_MS = DEDUPE_MS * 2
const MAX_RECENT_KEYS = 256
const SURFACES: ReadonlySet<string> = new Set([
  'app-root',
  'web-root',
  'workspace-shell',
  'sidebar',
  'terminal-workbench',
  'right-sidebar',
  'page',
  'modal',
  'overlay',
  'rich-markdown-editor'
])

function stringField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function nullableStringField(value: unknown, maxLength: number): string | null | undefined {
  return value === null ? null : stringField(value, maxLength)
}

function normalizeArgs(args: RendererErrorReportArgs): RendererErrorReportArgs | null {
  const originId = stringField(args.originId, 120)
  const surface = stringField(args.surface, 80)
  if (!originId || !surface || !SURFACES.has(surface)) {
    return null
  }
  const kind =
    args.kind === 'terminal-error' || args.kind === 'renderer-unhandled-error'
      ? args.kind
      : 'react-error-boundary'
  const activeModal = nullableStringField(args.activeModal, 80)
  return {
    kind,
    originId,
    // Why: membership in the closed surface set above validates the RPC string.
    surface: surface as RendererErrorReportArgs['surface'],
    errorName: stringField(args.errorName, 120) ?? 'Error',
    errorMessage: stringField(args.errorMessage, 1_000) ?? 'Unknown render error',
    ...(stringField(args.errorStack, 8_000)
      ? { errorStack: stringField(args.errorStack, 8_000) }
      : {}),
    ...(stringField(args.componentStack, 8_000)
      ? { componentStack: stringField(args.componentStack, 8_000) }
      : {}),
    ...(stringField(args.activeView, 80) ? { activeView: stringField(args.activeView, 80) } : {}),
    ...(activeModal !== undefined ? { activeModal } : {}),
    ...(stringField(args.activeTabType, 80)
      ? { activeTabType: stringField(args.activeTabType, 80) }
      : {}),
    ...(stringField(args.activeRightSidebarTab, 80)
      ? { activeRightSidebarTab: stringField(args.activeRightSidebarTab, 80) }
      : {}),
    ...(typeof args.hasActiveWorktree === 'boolean'
      ? { hasActiveWorktree: args.hasActiveWorktree }
      : {}),
    ...(stringField(args.chromeVersion, 120)
      ? { chromeVersion: stringField(args.chromeVersion, 120) }
      : {})
  }
}

function pruneKeys(now: number): void {
  for (const [key, seenAt] of recentReportKeys) {
    if (now - seenAt > MAX_KEY_AGE_MS) {
      recentReportKeys.delete(key)
    }
  }
  while (recentReportKeys.size > MAX_RECENT_KEYS) {
    const oldest = recentReportKeys.keys().next().value
    if (oldest === undefined) {
      break
    }
    recentReportKeys.delete(oldest)
  }
}

function reportKey(args: RendererErrorReportArgs): string {
  return JSON.stringify({
    kind: args.kind,
    originId: args.originId,
    surface: args.surface,
    errorName: args.errorName,
    errorMessage: args.errorMessage,
    componentStack: args.componentStack
  }).slice(0, 12_000)
}

export async function recordRendererError(
  store: CrashReportStore,
  input: RendererErrorReportArgs
): Promise<RendererErrorReportResult> {
  const args = normalizeArgs(input)
  if (!args) {
    return { ok: false, error: 'Invalid renderer error report.' }
  }
  const now = Date.now()
  pruneKeys(now)
  const key = reportKey(args)
  if (now - (recentReportKeys.get(key) ?? 0) < DEDUPE_MS) {
    return { ok: true, report: null, deduped: true }
  }
  recentReportKeys.set(key, now)
  pruneKeys(now)

  const report = await store.record({
    source: 'renderer',
    processType:
      args.kind === 'react-error-boundary'
        ? 'react-render'
        : args.kind === 'terminal-error'
          ? 'terminal'
          : 'renderer',
    reason: args.kind,
    exitCode: null,
    appVersion: getRuntimeHostPathsProvider().version(),
    platform: process.platform,
    osRelease: release(),
    arch: arch(),
    chromeVersion: args.chromeVersion ?? 'unknown',
    details: {
      ...(args.kind === 'react-error-boundary'
        ? { boundary_id: args.originId }
        : { error_origin: args.originId }),
      surface: args.surface,
      error_name: args.errorName,
      error_message: args.errorMessage,
      ...(args.errorStack ? { error_stack: args.errorStack } : {}),
      ...(args.componentStack ? { component_stack: args.componentStack } : {}),
      ...(args.activeView ? { active_view: args.activeView } : {}),
      ...(args.activeModal !== undefined ? { active_modal: args.activeModal } : {}),
      ...(args.activeTabType ? { active_tab_type: args.activeTabType } : {}),
      ...(args.activeRightSidebarTab ? { right_sidebar_tab: args.activeRightSidebarTab } : {}),
      ...(args.hasActiveWorktree !== undefined
        ? { has_active_worktree: args.hasActiveWorktree }
        : {})
    },
    breadcrumbs: getCrashBreadcrumbSnapshot()
  })
  return { ok: true, report, deduped: false }
}
