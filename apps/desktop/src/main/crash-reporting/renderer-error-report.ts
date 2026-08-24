import os from 'node:os'

import { app } from 'electron'
import type { RendererErrorReportArgs, RendererErrorReportResult } from '~shared/crash-reporting'

import { getCrashBreadcrumbSnapshot } from './crash-breadcrumb-store'
import type { CrashReportStore } from './crash-report-store'

const recentRendererErrorReportKeys = new Map<string, number>()
const RENDERER_ERROR_DEDUPE_MS = 10 * 60 * 1000
const MAX_RENDERER_ERROR_KEY_AGE_MS = RENDERER_ERROR_DEDUPE_MS * 2
const MAX_RECENT_RENDERER_ERROR_REPORT_KEYS = 256
const RENDERER_ERROR_SURFACES: ReadonlySet<string> = new Set([
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
  if (!trimmed) {
    return undefined
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function nullableStringField(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) {
    return null
  }
  return stringField(value, maxLength)
}

function isRendererErrorSurface(value: string): value is RendererErrorReportArgs['surface'] {
  return RENDERER_ERROR_SURFACES.has(value)
}

function normalizeRendererErrorReportArgs(args: unknown): RendererErrorReportArgs | null {
  if (!args || typeof args !== 'object') {
    return null
  }
  const field = (name: string): unknown => Reflect.get(args, name)
  const kindValue = field('kind')
  const kind =
    kindValue === 'terminal-error' || kindValue === 'renderer-unhandled-error'
      ? kindValue
      : 'react-error-boundary'
  const originId =
    stringField(field('originId'), 120) ??
    // Why: keep reports from an older renderer valid across a desktop update.
    stringField(field('boundaryId'), 120)
  const surface = stringField(field('surface'), 80)
  if (!originId || !surface || !isRendererErrorSurface(surface)) {
    return null
  }

  const errorStack = stringField(field('errorStack'), 8_000)
  const componentStack = stringField(field('componentStack'), 8_000)
  const activeView = stringField(field('activeView'), 80)
  const activeModal = nullableStringField(field('activeModal'), 80)
  const activeTabType = stringField(field('activeTabType'), 80)
  const activeRightSidebarTab = stringField(field('activeRightSidebarTab'), 80)
  const hasActiveWorktree = field('hasActiveWorktree')
  return {
    kind,
    originId,
    surface,
    errorName: stringField(field('errorName'), 120) ?? 'Error',
    errorMessage: stringField(field('errorMessage'), 1_000) ?? 'Unknown render error',
    ...(errorStack ? { errorStack } : {}),
    ...(componentStack ? { componentStack } : {}),
    ...(activeView ? { activeView } : {}),
    ...(activeModal !== undefined ? { activeModal } : {}),
    ...(activeTabType ? { activeTabType } : {}),
    ...(activeRightSidebarTab ? { activeRightSidebarTab } : {}),
    ...(typeof hasActiveWorktree === 'boolean' ? { hasActiveWorktree } : {})
  }
}

function pruneRendererErrorReportKeys(now: number): void {
  for (const [key, seenAt] of recentRendererErrorReportKeys) {
    if (now - seenAt > MAX_RENDERER_ERROR_KEY_AGE_MS) {
      recentRendererErrorReportKeys.delete(key)
    }
  }
  while (recentRendererErrorReportKeys.size > MAX_RECENT_RENDERER_ERROR_REPORT_KEYS) {
    const oldestKey = recentRendererErrorReportKeys.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    recentRendererErrorReportKeys.delete(oldestKey)
  }
}

function getRendererErrorReportKey(args: RendererErrorReportArgs): string {
  return JSON.stringify({
    kind: args.kind,
    originId: args.originId,
    surface: args.surface,
    errorName: args.errorName,
    errorMessage: args.errorMessage,
    componentStack: args.componentStack
  }).slice(0, 12_000)
}

export async function recordRendererErrorReport(
  store: CrashReportStore,
  args: unknown
): Promise<RendererErrorReportResult> {
  const normalized = normalizeRendererErrorReportArgs(args)
  if (!normalized) {
    return { ok: false, error: 'Invalid renderer error report.' }
  }

  const now = Date.now()
  pruneRendererErrorReportKeys(now)
  const key = getRendererErrorReportKey(normalized)
  if (now - (recentRendererErrorReportKeys.get(key) ?? 0) < RENDERER_ERROR_DEDUPE_MS) {
    return { ok: true, report: null, deduped: true }
  }
  recentRendererErrorReportKeys.set(key, now)
  // Why: renderer input can vary inside the age window, so count bounds the map too.
  pruneRendererErrorReportKeys(now)

  const report = await store.record({
    source: 'renderer',
    processType:
      normalized.kind === 'react-error-boundary'
        ? 'react-render'
        : normalized.kind === 'terminal-error'
          ? 'terminal'
          : 'renderer',
    reason: normalized.kind,
    exitCode: null,
    appVersion: app.getVersion(),
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    electronVersion: process.versions.electron ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    details: {
      ...(normalized.kind === 'react-error-boundary'
        ? { boundary_id: normalized.originId }
        : { error_origin: normalized.originId }),
      surface: normalized.surface,
      error_name: normalized.errorName,
      error_message: normalized.errorMessage,
      ...(normalized.errorStack ? { error_stack: normalized.errorStack } : {}),
      ...(normalized.componentStack ? { component_stack: normalized.componentStack } : {}),
      ...(normalized.activeView ? { active_view: normalized.activeView } : {}),
      ...(normalized.activeModal !== undefined ? { active_modal: normalized.activeModal } : {}),
      ...(normalized.activeTabType ? { active_tab_type: normalized.activeTabType } : {}),
      ...(normalized.activeRightSidebarTab
        ? { right_sidebar_tab: normalized.activeRightSidebarTab }
        : {}),
      ...(normalized.hasActiveWorktree !== undefined
        ? { has_active_worktree: normalized.hasActiveWorktree }
        : {})
    },
    breadcrumbs: getCrashBreadcrumbSnapshot()
  })
  return { ok: true, report, deduped: false }
}
