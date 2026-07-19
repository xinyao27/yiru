import {
  ArrowRight,
  StopCircle as CircleStop,
  FolderOpen,
  GitBranch,
  Lightbulb,
  HardDrives as Server
} from '@phosphor-icons/react'
import type { Dispatch, SetStateAction } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

import type { NestedRepoScanResult } from '../../../../shared/types'
import { RepoStepNestedImportPanel } from './repo-step-nested-import-panel'

type RepoStepProps = {
  cloneUrl: string
  onCloneUrlChange: (value: string) => void
  nestedScan: NestedRepoScanResult | null
  nestedScanInProgress: boolean
  nestedSelectedPaths: Set<string>
  onNestedSelectedPathsChange: Dispatch<SetStateAction<Set<string>>>
  onImportNested: () => void
  onCancelNested: () => void
  onStopNestedScan: () => void
  onOpenFolder: () => void
  onOpenServerFolder: (kind: 'git' | 'folder') => void
  onClone: () => void
  onOpenSshSettings: () => void
  serverPath: string
  onServerPathChange: (value: string) => void
  cloneDestination: string
  onCloneDestinationChange: (value: string) => void
  workspaceDir: string
  runtimeActive: boolean
  busyLabel: string | null
  error: string | null
}

export function RepoStep({
  cloneUrl,
  onCloneUrlChange,
  nestedScan,
  nestedScanInProgress,
  nestedSelectedPaths,
  onNestedSelectedPathsChange,
  onImportNested,
  onCancelNested,
  onStopNestedScan,
  onOpenFolder,
  onOpenServerFolder,
  onClone,
  onOpenSshSettings,
  serverPath,
  onServerPathChange,
  cloneDestination,
  onCloneDestinationChange,
  workspaceDir,
  runtimeActive,
  busyLabel,
  error
}: RepoStepProps) {
  const disabled = Boolean(busyLabel)
  if (nestedScan) {
    return (
      <RepoStepNestedImportPanel
        nestedScan={nestedScan}
        nestedScanInProgress={nestedScanInProgress}
        nestedSelectedPaths={nestedSelectedPaths}
        onNestedSelectedPathsChange={onNestedSelectedPathsChange}
        onImportNested={onImportNested}
        onCancelNested={onCancelNested}
        onStopNestedScan={onStopNestedScan}
        busyLabel={busyLabel}
        error={error}
        disabled={disabled}
      />
    )
  }
  return (
    <div className="space-y-3">
      {runtimeActive ? (
        <form
          className="border-border bg-muted/30 rounded-lg border p-5"
          onSubmit={(event) => {
            event.preventDefault()
            onOpenServerFolder('git')
          }}
        >
          <div className="flex items-center gap-4">
            <div className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-lg">
              <FolderOpen className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-foreground text-base font-semibold">
                {translate(
                  'auto.components.onboarding.RepoStep.8cab104e3c',
                  'Open a project on this host'
                )}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[13px]">
                {translate(
                  'auto.components.onboarding.RepoStep.466108ab89',
                  'Enter a path that exists on the selected host.'
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="border-border bg-background text-foreground focus:border-foreground/50 focus:ring-foreground/15 min-w-0 flex-1 rounded-lg border px-4 py-3 font-mono text-sm transition outline-none focus:ring-2"
              placeholder={translate(
                'auto.components.onboarding.RepoStep.2ebbc26343',
                '/home/user/project'
              )}
              value={serverPath}
              disabled={disabled}
              spellCheck={false}
              onChange={(event) => onServerPathChange(event.target.value)}
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-40"
              disabled={!serverPath.trim() || disabled}
            >
              {translate('auto.components.onboarding.RepoStep.3863747c56', 'Add Git Project')}
            </button>
            <button
              type="button"
              className="border-border bg-background text-foreground hover:bg-muted/60 shrink-0 rounded-lg border px-4 py-3 text-sm font-medium disabled:opacity-40"
              disabled={!serverPath.trim() || disabled}
              onClick={() => onOpenServerFolder('folder')}
            >
              {translate('auto.components.onboarding.RepoStep.e8214aa632', 'Open as Folder')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="group border-border bg-muted/30 hover:border-foreground/40 hover:bg-muted/60 focus:border-foreground/70 focus:bg-muted/40 focus:ring-foreground/25 w-full rounded-xl border p-5 text-left transition focus:ring-2 focus:outline-none focus:ring-inset disabled:opacity-60"
          disabled={disabled}
          autoFocus={!disabled}
          onClick={onOpenFolder}
        >
          <div className="flex min-w-0 items-center gap-4">
            <div className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-lg">
              <FolderOpen className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="text-foreground min-w-0 text-base font-semibold">
                  {translate(
                    'auto.components.onboarding.RepoStep.f4e9c8dcf8',
                    'Browse for a folder'
                  )}
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition group-hover:translate-x-0.5" />
              </div>
              <div className="text-muted-foreground mt-0.5 text-[13px]">
                {translate(
                  'auto.components.onboarding.RepoStep.831524961f',
                  'Choose any local directory, git repo or not.'
                )}
              </div>
            </div>
          </div>
          <div className="border-border bg-muted text-muted-foreground mt-3 ml-[3.75rem] flex w-fit max-w-[calc(100%-3.75rem)] items-center gap-2 rounded-lg border px-3 py-2 text-[12px]">
            <span className="border-border bg-background text-foreground grid size-6 shrink-0 place-items-center rounded-md border">
              <Lightbulb className="size-3.5" />
            </span>
            <span>
              {translate(
                'auto.components.onboarding.RepoStep.6558d50c69',
                'Want to import many repos at once? Select the parent folder.'
              )}
            </span>
          </div>
        </button>
      )}

      <form
        className="border-border bg-muted/30 rounded-lg border p-5"
        onSubmit={(e) => {
          e.preventDefault()
          onClone()
        }}
      >
        <div className="flex items-center gap-4">
          <div className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-lg">
            <GitBranch className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-base font-semibold">
              {translate('auto.components.onboarding.RepoStep.132425a3e3', 'Clone a repo')}
            </div>
            <div className="text-muted-foreground mt-0.5 text-[13px]">
              {translate(
                'auto.components.onboarding.RepoStep.288d8444b7',
                'Paste an HTTPS or SSH URL.'
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="border-border bg-background text-foreground focus:border-foreground/50 focus:ring-foreground/15 min-w-0 flex-1 rounded-lg border px-4 py-3 font-mono text-sm transition outline-none focus:ring-2"
            placeholder={translate(
              'auto.components.onboarding.RepoStep.955134915e',
              'git@github.com:org/repo.git'
            )}
            value={cloneUrl}
            disabled={disabled}
            onChange={(event) => onCloneUrlChange(event.target.value)}
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-5 py-3 text-sm font-medium disabled:opacity-40"
            disabled={!cloneUrl.trim() || (runtimeActive && !cloneDestination.trim()) || disabled}
          >
            {translate('auto.components.onboarding.RepoStep.7932e95f68', 'Clone')}
          </button>
        </div>
        {runtimeActive && (
          <div className="mt-2 space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium">
              {translate('auto.components.onboarding.RepoStep.24c7c8696c', 'Clone into host path')}
            </label>
            <input
              className="border-border bg-background text-foreground focus:border-foreground/50 focus:ring-foreground/15 w-full rounded-lg border px-4 py-3 font-mono text-sm transition outline-none focus:ring-2"
              placeholder={translate(
                'auto.components.onboarding.RepoStep.7ec3f48820',
                '/home/user'
              )}
              value={cloneDestination}
              disabled={disabled}
              spellCheck={false}
              onChange={(event) => onCloneDestinationChange(event.target.value)}
            />
          </div>
        )}
      </form>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 px-1 pt-1 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span>{translate('auto.components.onboarding.RepoStep.7b679207e4', 'Workspace')}</span>
          <span className="text-foreground truncate font-mono">
            {runtimeActive
              ? translate('auto.components.onboarding.RepoStep.cf23006ba7', 'Selected host')
              : workspaceDir}
          </span>
        </div>
        {runtimeActive ? (
          <div className="flex items-center gap-1.5">
            <Server className="size-3.5" />
            <span>
              {translate('auto.components.onboarding.RepoStep.c33b190ca3', 'Host paths only')}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onOpenSshSettings}
          >
            <Server className="size-3.5 shrink-0" />
            <span className="truncate">
              {translate(
                'auto.components.onboarding.RepoStep.b7c4da0504',
                'SSH? Set hosts up in Settings'
              )}
            </span>
            <ArrowRight className="size-3.5 shrink-0" />
          </button>
        )}
      </div>

      {busyLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-400/10 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-200">
          <span className="min-w-0 flex-1">{busyLabel}</span>
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
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}
