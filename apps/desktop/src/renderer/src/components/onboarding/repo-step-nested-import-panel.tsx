import { StopCircle as CircleStop, FolderOpen } from '@phosphor-icons/react'
import type { Dispatch, SetStateAction } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { ArrowLeft } from '@/components/regular-icons'
import { NestedRepoChecklist } from '@/components/repo/nested-repo-checklist'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

import { getRuntimePathBasename } from '../../../../shared/cross-platform-path'
import type { NestedRepoScanResult } from '../../../../shared/types'
import { NestedRepoScanLimitNotice } from '../repo/nested-repo-scan-limit-notice'

type RepoStepNestedImportPanelProps = {
  nestedScan: NestedRepoScanResult
  nestedScanInProgress: boolean
  nestedSelectedPaths: Set<string>
  onNestedSelectedPathsChange: Dispatch<SetStateAction<Set<string>>>
  onImportNested: () => void
  onCancelNested: () => void
  onStopNestedScan: () => void
  busyLabel: string | null
  error: string | null
  disabled: boolean
}

export function RepoStepNestedImportPanel({
  nestedScan,
  nestedScanInProgress,
  nestedSelectedPaths,
  onNestedSelectedPathsChange,
  onImportNested,
  onCancelNested,
  onStopNestedScan,
  busyLabel,
  error,
  disabled
}: RepoStepNestedImportPanelProps) {
  const folderName = getRuntimePathBasename(nestedScan.selectedPath) || nestedScan.selectedPath
  const nestedImportDisabled = disabled || nestedScanInProgress
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="border-border bg-muted/30 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border p-5">
        <div className="flex min-w-0 shrink-0 items-center gap-4">
          <div className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-lg">
            <FolderOpen className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-base font-semibold">
              {translate('auto.components.onboarding.RepoStep.2d20200346', 'Import repositories')}
            </div>
            <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
              {nestedScanInProgress ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="group text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:ring-destructive/40"
                        aria-label={translate(
                          'auto.components.onboarding.RepoStep.c3d9d44ca2',
                          'Stop scan'
                        )}
                        title={translate(
                          'auto.components.onboarding.RepoStep.c7af322fc3',
                          'Stop scanning'
                        )}
                        onClick={onStopNestedScan}
                      >
                        <LoadingIndicator className="text-annotation-highlight size-3.5 group-hover:hidden group-focus-visible:hidden" />
                        <CircleStop className="hidden size-3.5 group-hover:block group-focus-visible:block" />
                      </Button>
                    }
                  />
                  <TooltipContent side="top" sideOffset={4}>
                    {translate(
                      'auto.components.onboarding.RepoStep.e8fdb36338',
                      'Scanning repositories. Click to stop.'
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <span className="min-w-0 truncate">
                {translate(
                  'auto.components.onboarding.RepoStep.2e6438dd34',
                  '{{value0}}Found {{value1}} {{value2}} in this folder.',
                  {
                    value0: nestedScanInProgress ? 'Scanning... ' : '',
                    value1: nestedScan.repos.length,
                    value2: nestedScan.repos.length === 1 ? 'repository' : 'repositories'
                  }
                )}
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {translate('auto.components.onboarding.RepoStep.cecd6593fa', 'Scanned folder:')}{' '}
              {folderName} - {nestedScan.selectedPath}
            </div>
          </div>
        </div>
        <NestedRepoChecklist
          scan={nestedScan}
          selectedPaths={nestedSelectedPaths}
          onSelectedPathsChange={onNestedSelectedPathsChange}
          disabled={nestedImportDisabled}
          className="mt-4 flex-1"
        />
        {nestedScanInProgress ||
        nestedScan.truncated ||
        nestedScan.timedOut ||
        nestedScan.stopped ? (
          <div className="mt-2 shrink-0">
            <NestedRepoScanLimitNotice scan={nestedScan} />
          </div>
        ) : null}
        <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground inline-flex items-center gap-1 rounded-lg px-3 py-3 text-sm disabled:opacity-40"
            disabled={disabled && !nestedScanInProgress}
            onClick={onCancelNested}
          >
            <ArrowLeft className="size-3.5" />
            {translate('auto.components.onboarding.RepoStep.27ca610db1', 'Back')}
          </button>
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 ml-auto rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-40"
            disabled={nestedImportDisabled || nestedSelectedPaths.size === 0}
            onClick={onImportNested}
          >
            {translate('auto.components.onboarding.RepoStep.2d20200346', 'Import repositories')}
          </button>
        </div>
      </div>
      {busyLabel ? (
        <div className="shrink-0 rounded-lg border border-blue-400/30 bg-blue-400/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-200">
          {busyLabel}
        </div>
      ) : null}
      {error ? (
        <div className="shrink-0 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}
    </div>
  )
}
