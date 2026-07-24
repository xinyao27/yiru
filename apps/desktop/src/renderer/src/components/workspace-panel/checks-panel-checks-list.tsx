import {
  CircleDashed,
  CaretRight as ChevronRight,
  ArrowSquareOut as ExternalLink
} from '@phosphor-icons/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'

import type { PRCheckDetail, PRCheckRunDetails } from '../../../../shared/types'
import { useCheckDetailsResize } from './check-details-resize'
import { CHECK_COLOR, CHECK_ICON } from './check-status-presentation'
import { CheckRunDetails } from './checks-panel-check-run-details'
import {
  CHECK_SORT_ORDER,
  getCheckDetailsKey,
  getCheckStatusLabel,
  isFailedCheck,
  type CheckDetailsLoadState,
  type CheckDetailsStickySurface
} from './checks-panel-check-status'
import { ChecksSummary } from './checks-panel-checks-summary'

export function ChecksList({
  checks,
  checksLoading,
  checkDetailsContextKey,
  onLoadCheckDetails,
  worktreeId: worktreeIdOverride,
  persistDetails = true,
  detailsStickySurface = 'sidebar'
}: {
  checks: PRCheckDetail[]
  checksLoading: boolean
  checkDetailsContextKey: string
  onLoadCheckDetails?: (check: PRCheckDetail) => Promise<PRCheckRunDetails | null>
  /** Why: folder-workspace PR checks render rows for attached worktrees, not the active one. */
  worktreeId?: string
  persistDetails?: boolean
  detailsStickySurface?: CheckDetailsStickySurface
}): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  // Why: projection-only remote checks must not write details into the local Worktree cache.
  const resolvedWorktreeId = persistDetails
    ? (worktreeIdOverride ?? activeWorktree?.id ?? null)
    : null
  const patchOpenCheckRunDetails = useAppStore((s) => s.patchOpenCheckRunDetails)
  const [checksExpanded, setChecksExpanded] = useState(true)
  const [expandedCheckKeys, setExpandedCheckKeys] = useState<Set<string>>(new Set())
  const [detailsByCheckKey, setDetailsByCheckKey] = useState<Record<string, CheckDetailsLoadState>>(
    {}
  )
  const detailsContextRef = useRef(checkDetailsContextKey)
  const autoExpandedContextRef = useRef<string | null>(null)
  // Why: expanded check details already sit inside the sidebar scroller; keeping
  // the list scroller too creates nested scrollbars around CI annotations.
  const shouldConstrainCheckList = checksExpanded && expandedCheckKeys.size === 0
  const { detailsHeight, handleResizeStart } = useCheckDetailsResize(
    shouldConstrainCheckList && checks.length > 0
  )
  detailsContextRef.current = checkDetailsContextKey
  const sorted = React.useMemo(
    () =>
      [...checks].sort(
        (a, b) =>
          (CHECK_SORT_ORDER[a.conclusion ?? 'pending'] ?? 3) -
          (CHECK_SORT_ORDER[b.conclusion ?? 'pending'] ?? 3)
      ),
    [checks]
  )
  const rows = React.useMemo(
    () =>
      sorted.map((check, index) => ({
        check,
        key: getCheckDetailsKey(checkDetailsContextKey, check, index)
      })),
    [checkDetailsContextKey, sorted]
  )
  const passingCount = checks.filter((c) => c.conclusion === 'success').length
  const failingCount = checks.filter((c) => isFailedCheck(c)).length
  const pendingCount = checks.filter(
    (c) => c.conclusion === 'pending' || c.conclusion === null
  ).length

  useEffect(() => {
    const validKeys = new Set(rows.map((row) => row.key))
    setDetailsByCheckKey((current) => {
      const next: Record<string, CheckDetailsLoadState> = {}
      for (const [key, state] of Object.entries(current)) {
        if (validKeys.has(key)) {
          next[key] = state
        }
      }
      return next
    })
    setExpandedCheckKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)))
      if (autoExpandedContextRef.current !== checkDetailsContextKey) {
        const firstFailed = rows.find((row) => isFailedCheck(row.check))
        if (firstFailed) {
          next.add(firstFailed.key)
        }
        autoExpandedContextRef.current = checkDetailsContextKey
      }
      return next
    })
  }, [checkDetailsContextKey, rows])

  useEffect(() => {
    setDetailsByCheckKey((current) => {
      let changed = false
      const next: Record<string, CheckDetailsLoadState> = { ...current }
      for (const row of rows) {
        const cached = next[row.key]
        if (!cached?.details) {
          continue
        }
        if (
          cached.details.status !== row.check.status ||
          cached.details.conclusion !== row.check.conclusion
        ) {
          delete next[row.key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [rows])

  const requestCheckDetails = useCallback(
    (row: { check: PRCheckDetail; key: string }) => {
      if (detailsByCheckKey[row.key]?.loading || detailsByCheckKey[row.key]?.details) {
        return
      }
      if (!row.check.checkRunId && !row.check.workflowRunId && !row.check.url) {
        setDetailsByCheckKey((current) => ({
          ...current,
          [row.key]: {
            loading: false,
            details: null,
            error: translate(
              'auto.components.right.sidebar.checks.panel.content.e15a8b77ef',
              'No inline details are available for this check.'
            )
          }
        }))
        return
      }
      if (!onLoadCheckDetails) {
        setDetailsByCheckKey((current) => ({
          ...current,
          [row.key]: {
            loading: false,
            details: null,
            error: translate(
              'auto.components.right.sidebar.checks.panel.content.e15a8b77ef',
              'No inline details are available for this check.'
            )
          }
        }))
        return
      }
      const requestContextKey = checkDetailsContextKey
      setDetailsByCheckKey((current) => ({
        ...current,
        [row.key]: { loading: true, details: null, error: null }
      }))
      void onLoadCheckDetails(row.check)
        .then((details) => {
          if (detailsContextRef.current !== requestContextKey) {
            return
          }
          setDetailsByCheckKey((current) => ({
            ...current,
            [row.key]: {
              loading: false,
              details,
              error: details ? null : 'No inline details are available for this check.'
            }
          }))
        })
        .catch((err) => {
          if (detailsContextRef.current !== requestContextKey) {
            return
          }
          setDetailsByCheckKey((current) => ({
            ...current,
            [row.key]: {
              loading: false,
              details: null,
              error: err instanceof Error ? err.message : 'Failed to load check details.'
            }
          }))
        })
    },
    [checkDetailsContextKey, detailsByCheckKey, onLoadCheckDetails]
  )

  useEffect(() => {
    if (!checksExpanded) {
      return
    }
    for (const row of rows) {
      if (expandedCheckKeys.has(row.key) && !detailsByCheckKey[row.key]) {
        requestCheckDetails(row)
      }
    }
  }, [checksExpanded, detailsByCheckKey, expandedCheckKeys, requestCheckDetails, rows])

  useEffect(() => {
    if (!resolvedWorktreeId) {
      return
    }
    for (const row of rows) {
      const detailsState = detailsByCheckKey[row.key]
      if (!detailsState) {
        continue
      }
      patchOpenCheckRunDetails(resolvedWorktreeId, checkDetailsContextKey, row.check, {
        details: detailsState.details ?? null,
        loading: detailsState.loading ?? false,
        error: detailsState.error ?? null
      })
    }
  }, [
    checkDetailsContextKey,
    detailsByCheckKey,
    patchOpenCheckRunDetails,
    resolvedWorktreeId,
    rows
  ])

  const toggleCheckExpanded = useCallback(
    (row: { check: PRCheckDetail; key: string }) => {
      const willExpand = !expandedCheckKeys.has(row.key)
      setExpandedCheckKeys((current) => {
        const next = new Set(current)
        if (next.has(row.key)) {
          next.delete(row.key)
        } else {
          next.add(row.key)
        }
        return next
      })
      if (willExpand) {
        requestCheckDetails(row)
      }
    },
    [expandedCheckKeys, requestCheckDetails]
  )

  return (
    <>
      <ChecksSummary
        checksCount={checks.length}
        passingCount={passingCount}
        failingCount={failingCount}
        pendingCount={pendingCount}
        checksLoading={checksLoading}
        checksExpanded={checksExpanded}
        onToggle={() => setChecksExpanded((expanded) => !expanded)}
      />

      {/* Checks List */}
      {checksLoading && checks.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <LoadingIndicator className="text-muted-foreground size-5" />
        </div>
      ) : checks.length === 0 ? (
        <div className="text-muted-foreground px-4 py-8 text-[11px]">
          {translate(
            'auto.components.right.sidebar.checks.panel.content.991f50c7e4',
            'No checks configured'
          )}
        </div>
      ) : !checksExpanded ? null : (
        <>
          <div
            className={cn('py-1', shouldConstrainCheckList && 'overflow-y-auto scrollbar-sleek')}
            style={shouldConstrainCheckList ? { maxHeight: detailsHeight } : undefined}
          >
            {rows.map((row) => {
              const check = row.check
              const conclusion = check.conclusion ?? 'pending'
              const Icon = CHECK_ICON[conclusion] ?? CircleDashed
              const color = CHECK_COLOR[conclusion] ?? 'text-muted-foreground'
              const expanded = expandedCheckKeys.has(row.key)
              const openUrl = check.url
              return (
                <div key={row.key} className="min-w-0">
                  <div
                    className={cn(
                      'group/check-row flex min-w-0 cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors hover:bg-accent/40',
                      expanded && 'bg-accent/25'
                    )}
                    onClick={() => toggleCheckExpanded(row)}
                  >
                    <ChevronRight
                      weight="regular"
                      className={cn(
                        'size-3 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-90'
                      )}
                    />
                    <Icon className={cn('size-3.5 shrink-0', color)} />
                    <span className="text-foreground flex-1 truncate text-[12px]">
                      {check.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="text-muted-foreground text-[11px]">
                        {getCheckStatusLabel(check)}
                      </span>
                      {openUrl && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                variant="quiet"
                                size="icon-xs"
                                className="size-6"
                                aria-label={translate(
                                  'auto.components.right.sidebar.checks.panel.content.0dca6bfab5',
                                  'Open check details'
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  window.api.shell.openUrl(openUrl)
                                }}
                              >
                                <ExternalLink weight="regular" className="size-3" />
                              </Button>
                            }
                          />
                          <TooltipContent side="left" sideOffset={4}>
                            {translate(
                              'auto.components.right.sidebar.checks.panel.content.0dca6bfab5',
                              'Open check details'
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                  {expanded && (
                    <CheckRunDetails
                      check={check}
                      state={detailsByCheckKey[row.key]}
                      checkDetailsContextKey={checkDetailsContextKey}
                      worktreeId={resolvedWorktreeId}
                      detailsStickySurface={detailsStickySurface}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {shouldConstrainCheckList && (
            <div
              role="separator"
              aria-orientation="horizontal"
              title={translate(
                'auto.components.right.sidebar.checks.panel.content.7f793b571d',
                'Drag to resize checks'
              )}
              className="group border-border flex h-2 cursor-row-resize items-center border-b"
              onMouseDown={handleResizeStart}
            >
              <div className="group-hover:bg-ring/40 h-px w-full bg-transparent transition-colors" />
            </div>
          )}
          {checks.length >= 100 && (
            <div className="border-border text-muted-foreground border-b px-3 py-1.5 text-[10px]">
              {translate(
                'auto.components.right.sidebar.checks.panel.content.cbcc4ab3db',
                'Showing first 100 checks'
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
