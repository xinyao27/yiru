import {
  Warning as AlertTriangle,
  GitBranch,
  ArrowCounterClockwise as RotateCcw,
  X
} from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { translate } from '@/i18n/i18n'
import { getCreationProgressLabel } from '@/lib/pending-worktree-creation'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { retryBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { useAppStore } from '@/store'

/**
 * In-frame creation state, shown in the workspace content area while a worktree
 * is being created. Presented as a faux tab: a tab strip carrying the new
 * worktree's name (the title) over a body that holds the live status. This lets
 * the in-progress create read as a real workspace tab whose content is loading,
 * so the handoff to the real terminal is a same-frame swap — and the title
 * (name) and the body status never duplicate each other. Its appearance is
 * debounced upstream so fast creates never paint it.
 */
export default function WorktreeCreationPanel({
  creationId,
  reserveCollapsedSidebarHeaderSpace = false
}: {
  creationId: string
  reserveCollapsedSidebarHeaderSpace?: boolean
}): React.JSX.Element | null {
  const entry = useAppStore((s) => s.pendingWorktreeCreations[creationId])
  const [now, setNow] = React.useState(() => Date.now())
  // Why: depend on the primitive status only — provisioning appends a log to the
  // entry on every stderr chunk, giving a fresh `entry` reference each tick that
  // would otherwise tear down and recreate this interval before it can fire.
  const entryStatus = entry?.status
  React.useEffect(() => {
    if (entryStatus !== 'creating') {
      return
    }
    // Pause the 1s clock while the window is hidden so a backgrounded creation
    // panel stops re-rendering for ticks no one can see.
    return installWindowVisibilityInterval({ run: () => setNow(Date.now()), intervalMs: 1000 })
  }, [entryStatus])
  if (!entry) {
    return null
  }

  const dismiss = (): void => useAppStore.getState().removePendingWorktreeCreation(creationId)
  const isError = entry.status === 'error'
  // VM creations keep the 'provisioning-vm' phase even on failure, so the failure renders in the
  // same centered layout as provisioning (just with the error header) rather than the generic block.
  const isVmCreation = entry.phase === 'provisioning-vm'
  const title = entry.request.displayName || entry.request.name
  const elapsedLabel = formatElapsedTime(now - entry.startedAt)

  return (
    <div className="bg-background absolute inset-0 flex flex-col [[data-native-sidebar-material=true]_&]:bg-[linear-gradient(to_bottom,transparent_40px,var(--background)_40px)]">
      {/* Faux tab strip: mirrors the real tab row (height, border, bg) so the
          create reads as a workspace tab. Carries only the worktree name + a
          cancel control — the live status lives in the body below. */}
      <div className="border-border bg-card flex h-10 shrink-0 items-stretch border-b [[data-native-sidebar-material=true]_&]:bg-transparent">
        {reserveCollapsedSidebarHeaderSpace ? (
          // Why: collapsed sidebar chrome floats above this strip, so reserve
          // the same measured width real tabs use to keep title/cancel clear.
          <div
            className="shrink-0"
            style={
              {
                width: 'var(--collapsed-sidebar-header-width)',
                WebkitAppRegion: 'no-drag'
              } as React.CSSProperties
            }
          />
        ) : null}
        <div className="border-border flex h-full max-w-[240px] min-w-32 items-center gap-2 border-x border-t px-3 text-xs">
          {isError ? (
            <AlertTriangle className="text-destructive size-3.5 shrink-0" />
          ) : (
            // Why: a static worktree glyph (not a spinner) keeps the tab reading
            // as a normal tab; the single loading spinner lives in the body.
            <GitBranch className="text-muted-foreground size-3.5 shrink-0" />
          )}
          <span className="text-foreground truncate font-medium">{title}</span>
          <button
            type="button"
            title={translate(
              'auto.components.worktree.creation.WorktreeCreationPanel.532aea14ce',
              'Cancel'
            )}
            aria-label={translate(
              'auto.components.worktree.creation.WorktreeCreationPanel.a3346fc6ed',
              'Cancel worktree creation'
            )}
            onClick={dismiss}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground flex size-4 shrink-0 items-center justify-center rounded-sm outline-none"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Body: a quiet top-left annotation on the surface the terminal will
          fill — the same spot terminal output appears — so creation → terminal
          reads as one frame filling in. */}
      <div className="min-h-0 flex-1 p-3">
        {isVmCreation ? (
          // Why: keep the same centered layout for provisioning AND failure so the recipe log stays
          // put — on failure the spinner header just swaps to the error + Retry/Dismiss.
          <VmProvisioningStatus
            elapsedLabel={elapsedLabel}
            log={entry.provisioningLog ?? ''}
            error={
              isError
                ? (entry.error ??
                  translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.767951265d',
                    'Something went wrong while creating the worktree.'
                  ))
                : null
            }
            onCancel={dismiss}
            onRetry={() => retryBackgroundWorktreeCreation(creationId)}
            onDismiss={dismiss}
          />
        ) : isError ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-destructive font-medium">
              {translate(
                'auto.components.worktree.creation.WorktreeCreationPanel.ed2a664f8b',
                'Couldn’t create worktree'
              )}
            </span>
            <span className="text-muted-foreground">
              {entry.error ??
                translate(
                  'auto.components.worktree.creation.WorktreeCreationPanel.767951265d',
                  'Something went wrong while creating the worktree.'
                )}
            </span>
            <button
              type="button"
              onClick={() => retryBackgroundWorktreeCreation(creationId)}
              className="text-foreground focus-visible:bg-accent inline-flex items-center gap-1 outline-none hover:underline"
            >
              <RotateCcw className="size-3" />
              {translate(
                'auto.components.worktree.creation.WorktreeCreationPanel.34dd5ee38b',
                'Retry'
              )}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent outline-none hover:underline"
            >
              {translate(
                'auto.components.worktree.creation.WorktreeCreationPanel.dabd226118',
                'Dismiss'
              )}
            </button>
          </div>
        ) : (
          <div className="text-muted-foreground flex min-h-0 max-w-3xl flex-col gap-2 text-xs">
            <div className="flex items-center gap-2">
              <LoadingIndicator className="size-3.5 shrink-0" />
              <span>{getCreationProgressLabel(entry)}</span>
              <span className="text-muted-foreground/70">{elapsedLabel}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function VmProvisioningStatus({
  elapsedLabel,
  log,
  error,
  onCancel,
  onRetry,
  onDismiss
}: {
  elapsedLabel: string
  log: string
  // When set, the recipe failed: keep the same centered layout + log, but swap the
  // spinner header for the error and Retry/Dismiss so nothing shifts on failure.
  error?: string | null
  onCancel?: () => void
  onRetry?: () => void
  onDismiss?: () => void
}): React.JSX.Element {
  const isError = error !== undefined && error !== null
  return (
    <div className="flex min-h-full justify-center pt-12">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {isError ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-medium">
                <AlertTriangle className="text-destructive size-4 shrink-0" />
                <span className="text-destructive">
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.ed2a664f8b',
                    'Couldn’t create worktree'
                  )}
                </span>
                <span className="text-muted-foreground font-normal">{error}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-foreground focus-visible:bg-accent inline-flex items-center gap-1 outline-none hover:underline"
                >
                  <RotateCcw className="size-3" />
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.34dd5ee38b',
                    'Retry'
                  )}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent outline-none hover:underline"
                >
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.dabd226118',
                    'Dismiss'
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-foreground flex items-center gap-2 text-sm font-medium">
                <LoadingIndicator className="text-muted-foreground size-4 shrink-0" />
                <span>
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.vmProvisioningTitle',
                    'Provisioning VM'
                  )}
                </span>
                <span className="text-muted-foreground text-xs font-normal">{elapsedLabel}</span>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent text-xs outline-none hover:underline"
              >
                {translate(
                  'auto.components.worktree.creation.WorktreeCreationPanel.cancelProvisioning',
                  'Cancel'
                )}
              </button>
            </>
          )}
        </div>
        <RecipeOutputLog
          log={log}
          emptyLabel={translate(
            'auto.components.worktree.creation.WorktreeCreationPanel.vmProvisioningLogEmpty',
            'Waiting for recipe output…'
          )}
        />
      </div>
    </div>
  )
}

// Why: the recipe's stderr is the only thing that explains a failure or a slow
// provision, so it gets the same fixed-height log surface whether provisioning is
// in progress or has failed.
function RecipeOutputLog({
  log,
  emptyLabel
}: {
  log: string
  emptyLabel: string
}): React.JSX.Element {
  const ref = React.useRef<HTMLPreElement>(null)
  // Why: follow the tail as output streams in, but stop following the moment the user scrolls up so
  // they can read earlier output. Resume following once they scroll back to the bottom.
  const pinnedToBottomRef = React.useRef(true)
  const handleScroll = React.useCallback((): void => {
    const el = ref.current
    if (!el) {
      return
    }
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
  }, [])
  React.useEffect(() => {
    const el = ref.current
    if (el && pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [log])
  return (
    <pre
      ref={ref}
      onScroll={handleScroll}
      className="scrollbar-sleek bg-muted/40 text-muted-foreground h-72 overflow-auto rounded-md p-3 font-mono text-[11px] leading-4 whitespace-pre-wrap"
    >
      {log || <span className="text-muted-foreground/60">{emptyLabel}</span>}
    </pre>
  )
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}
