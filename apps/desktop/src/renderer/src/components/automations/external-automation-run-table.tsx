import { WarningCircle as AlertCircle, FileText } from '@phosphor-icons/react'
/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: run rows are fetched from the external automation store; the loading state tracks that async request lifecycle. */
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight } from '@/components/regular-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type {
  ExternalAutomationJob,
  ExternalAutomationManager,
  ExternalAutomationRun
} from '../../../../shared/automations-types'
import { formatAutomationDateTimeWithRelative } from './automation-page-parts'
import {
  createExternalAutomationRunTableState,
  resolveExternalAutomationFetchedRuns,
  resolveExternalAutomationRunTableState,
  updateExternalAutomationRunTablePage
} from './external-automation-run-table-state'

const PAGE_SIZE = 8

export type ExternalAutomationRunPage = {
  runs: ExternalAutomationRun[]
  totalCount?: number
}

export type FetchExternalAutomationRuns = (input: {
  manager: ExternalAutomationManager
  job: ExternalAutomationJob
  page: number
  pageSize: number
}) => Promise<ExternalAutomationRun[] | ExternalAutomationRunPage>

type ExternalAutomationRunTableProps = {
  manager: ExternalAutomationManager
  job: ExternalAutomationJob
  now: number
  onFetchRuns?: FetchExternalAutomationRuns
  onOpenRun?: (run: ExternalAutomationRun) => void
}

function formatExternalDate(value: string | null, now: number): string {
  if (!value) {
    return 'Never'
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return value
  }
  return formatAutomationDateTimeWithRelative(parsed, now)
}

function getRunStatusLabel(run: ExternalAutomationRun): string {
  switch (run.status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'unknown':
      return 'Unknown'
  }
}

function getRunStatusVariant(
  run: ExternalAutomationRun
): React.ComponentProps<typeof Badge>['variant'] {
  switch (run.status) {
    case 'completed':
      return 'secondary'
    case 'failed':
      return 'destructive'
    case 'unknown':
      return 'outline'
  }
}

function getRunSummary(run: ExternalAutomationRun): string {
  return run.error ?? run.outputPreview ?? 'No output preview'
}

function normalizeRunPage(
  result: ExternalAutomationRun[] | ExternalAutomationRunPage
): ExternalAutomationRunPage {
  if (Array.isArray(result)) {
    return { runs: result }
  }
  return result
}

export function ExternalAutomationRunTable({
  manager,
  job,
  now,
  onFetchRuns,
  onOpenRun
}: ExternalAutomationRunTableProps): React.JSX.Element {
  const [tableState, setTableState] = useState(() => createExternalAutomationRunTableState(job))
  const [isLoading, setIsLoading] = useState(false)
  const managerRef = useRef(manager)
  const jobRef = useRef(job)

  managerRef.current = manager
  jobRef.current = job

  const resolvedTableState = resolveExternalAutomationRunTableState(tableState, job)
  if (resolvedTableState !== tableState) {
    // Why: manager rows can switch jobs while the table stays mounted; reset
    // before paint so stale fetched rows/selection never flash for the new job.
    setTableState(resolvedTableState)
  }
  const { page, selectedRunId, fetchedRuns, fetchedTotalCount, fetchError } = resolvedTableState

  useEffect(() => {
    if (!onFetchRuns) {
      return
    }
    let cancelled = false
    setIsLoading(true)
    setTableState((current) => ({
      ...resolveExternalAutomationRunTableState(current, jobRef.current),
      fetchError: null
    }))
    void onFetchRuns({
      manager: managerRef.current,
      job: jobRef.current,
      page,
      pageSize: PAGE_SIZE
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        const nextPage = normalizeRunPage(result)
        setTableState((current) =>
          resolveExternalAutomationFetchedRuns(current, jobRef.current, nextPage)
        )
      })
      .catch((error) => {
        if (!cancelled) {
          setTableState((current) => ({
            ...resolveExternalAutomationRunTableState(current, jobRef.current),
            fetchedRuns: null,
            fetchedTotalCount: null,
            fetchError: error instanceof Error ? error.message : 'Failed to load runs.'
          }))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [job.id, manager.id, onFetchRuns, page])

  const fallbackRuns = job.runs
  const visibleRuns = onFetchRuns
    ? (fetchedRuns ?? fallbackRuns.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE))
    : fallbackRuns.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const totalCount = onFetchRuns ? (fetchedTotalCount ?? job.runCount) : job.runCount
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const selectedRun = useMemo(
    () =>
      visibleRuns.find((run) => run.id === selectedRunId) ??
      fallbackRuns.find((run) => run.id === selectedRunId) ??
      visibleRuns[0] ??
      null,
    [fallbackRuns, selectedRunId, visibleRuns]
  )
  const hasVisibleRuns = visibleRuns.length > 0
  const pageStart = totalCount === 0 || !hasVisibleRuns ? 0 : page * PAGE_SIZE + 1
  const pageEnd = Math.min(totalCount, page * PAGE_SIZE + visibleRuns.length)

  const handlePageChange = (nextPage: number): void => {
    setTableState((current) => updateExternalAutomationRunTablePage(current, job, nextPage))
  }

  return (
    <div className="border-border/50 bg-background/50 mt-2 rounded-md border">
      <div className="border-border/50 flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-xs font-medium">
            {translate('auto.components.automations.ExternalAutomationRunTable.2d4388a908', 'Runs')}
          </div>
          {isLoading ? <LoadingIndicator className="text-muted-foreground size-3.5" /> : null}
          {fetchError ? (
            <Tooltip>
              <TooltipTrigger render={<AlertCircle className="text-destructive size-3.5" />} />
              <TooltipContent side="top" sideOffset={4}>
                {fetchError}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="text-muted-foreground text-xs">
          {totalCount}{' '}
          {totalCount === 1
            ? translate('auto.components.automations.ExternalAutomationRunTable.872d032d05', 'run')
            : translate(
                'auto.components.automations.ExternalAutomationRunTable.d5527d8fe7',
                'runs'
              )}
        </div>
      </div>

      {hasVisibleRuns ? (
        <div>
          <div className="border-border/50 min-w-0 border-b">
            <div className="border-border/50 text-muted-foreground grid grid-cols-[minmax(7.5rem,.45fr)_minmax(0,1fr)_auto] gap-3 border-b px-3 py-1.5 text-[11px] font-medium uppercase">
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.d4b34feb66',
                  'Run time'
                )}
              </span>
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.a813df9808',
                  'Preview'
                )}
              </span>
              <span>
                {translate(
                  'auto.components.automations.ExternalAutomationRunTable.be551397ca',
                  'Status'
                )}
              </span>
            </div>
            <div className="divide-border/50 divide-y">
              {visibleRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  data-current={selectedRun?.id === run.id}
                  onClick={() => {
                    setTableState((current) => ({
                      ...resolveExternalAutomationRunTableState(current, job),
                      selectedRunId: run.id
                    }))
                    onOpenRun?.(run)
                  }}
                  className={cn(
                    'grid w-full grid-cols-[minmax(7.5rem,.45fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none',
                    selectedRun?.id === run.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs">
                      {formatExternalDate(run.runAt, now)}
                    </span>
                    {run.outputPath ? (
                      <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[11px]">
                        {run.outputPath}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground min-w-0 truncate text-xs">
                    {getRunSummary(run)}
                  </span>
                  <Badge variant={getRunStatusVariant(run)}>{getRunStatusLabel(run)}</Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground px-3 py-4 text-sm">
          {isLoading
            ? translate(
                'auto.components.automations.ExternalAutomationRunTable.8ea934cacf',
                'Loading runs...'
              )
            : translate(
                'auto.components.automations.ExternalAutomationRunTable.9c080765ff',
                'No Hermes runs found yet.'
              )}
        </div>
      )}

      <div className="border-border/50 flex items-center justify-between border-t px-3 py-2">
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
          <FileText className="size-3.5" />
          <span>
            {pageStart}-{pageEnd}{' '}
            {translate('auto.components.automations.ExternalAutomationRunTable.7475c0ce96', 'of')}
            {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.automations.ExternalAutomationRunTable.52d468a0b8',
              'Previous run page'
            )}
            disabled={page === 0 || isLoading}
            onClick={() => handlePageChange(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <div className="text-muted-foreground min-w-14 text-center text-xs">
            {page + 1} / {totalPages}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate(
              'auto.components.automations.ExternalAutomationRunTable.0ba9c0a95c',
              'Next run page'
            )}
            disabled={page >= totalPages - 1 || isLoading}
            onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
