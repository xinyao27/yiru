import {
  Warning as AlertTriangle,
  Copy,
  ArrowClockwise as RefreshCw,
  Trash as Trash2
} from '@phosphor-icons/react'
import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { LoadingIndicator } from '@/components/loading-indicator'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { getEphemeralVmRecipeResultProjectRoot } from '../../../../shared/ephemeral-vm-recipes'
import type { EphemeralVmRuntimeRecord } from '../../../../shared/ephemeral-vm-runtimes'
import { Button } from '../ui/button'

const CLEANED_STATUSES = new Set<EphemeralVmRuntimeRecord['status']>(['cleaned'])

export function getVisibleEphemeralVmRuntimes(
  runtimes: readonly EphemeralVmRuntimeRecord[]
): EphemeralVmRuntimeRecord[] {
  return runtimes
    .filter((runtime) => !CLEANED_STATUSES.has(runtime.status))
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export function getEphemeralVmRuntimeStatusLabel(runtime: EphemeralVmRuntimeRecord): string {
  if (runtime.cleanupStatus === 'failed') {
    return translate(
      'auto.components.settings.EphemeralVmRuntimesSection.cleanupFailed',
      'Cleanup failed'
    )
  }
  if (runtime.cleanupStatus === 'running' || runtime.status === 'cleanup_pending') {
    return translate(
      'auto.components.settings.EphemeralVmRuntimesSection.cleanupRunning',
      'Cleanup running'
    )
  }
  if (runtime.cleanupStatus === 'disabled') {
    return translate(
      'auto.components.settings.EphemeralVmRuntimesSection.cleanupDisabled',
      'Cleanup disabled'
    )
  }
  if (runtime.status === 'running') {
    return translate('auto.components.settings.EphemeralVmRuntimesSection.running', 'Running')
  }
  if (runtime.status === 'failed') {
    return translate('auto.components.settings.EphemeralVmRuntimesSection.failed', 'Failed')
  }
  return runtime.status
}

export function EphemeralVmRuntimesSection(): React.JSX.Element {
  const [runtimes, setRuntimes] = useState<EphemeralVmRuntimeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cleaningId, setCleaningId] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  const refresh = useCallback(async (): Promise<void> => {
    if (mountedRef.current) {
      setIsLoading(true)
    }
    try {
      const nextRuntimes = await window.api.ephemeralVm.listRuntimes()
      if (mountedRef.current) {
        setRuntimes(getVisibleEphemeralVmRuntimes(nextRuntimes))
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.EphemeralVmRuntimesSection.loadFailed',
                'Couldn’t load temporary VM runtimes.'
              )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const cleanupRuntime = async (runtime: EphemeralVmRuntimeRecord): Promise<void> => {
    setCleaningId(runtime.id)
    try {
      const cleaned = await window.api.ephemeralVm.cleanup({ runtimeId: runtime.id })
      if (cleaned.cleanupStatus === 'failed') {
        throw new Error(
          cleaned.cleanupLastError ??
            translate(
              'auto.components.settings.EphemeralVmRuntimesSection.cleanupFailedToast',
              'Couldn’t clean up temporary VM runtime.'
            )
        )
      }
      if (mountedRef.current) {
        toast.success(
          cleaned.cleanupStatus === 'disabled'
            ? translate(
                'auto.components.settings.EphemeralVmRuntimesSection.markedCleaned',
                'Marked temporary VM runtime as cleaned.'
              )
            : translate(
                'auto.components.settings.EphemeralVmRuntimesSection.cleaned',
                'Cleaned up temporary VM runtime.'
              )
        )
      }
      await refresh()
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.EphemeralVmRuntimesSection.cleanupFailedToast',
                'Couldn’t clean up temporary VM runtime.'
              )
        )
        await refresh()
      }
    } finally {
      if (mountedRef.current) {
        setCleaningId(null)
      }
    }
  }

  const copyCleanupCommand = async (runtime: EphemeralVmRuntimeRecord): Promise<void> => {
    try {
      const result = await window.api.ephemeralVm.getCleanupCommand({ runtimeId: runtime.id })
      const text = result.command
        ? `${result.command}\n\n# Cleanup payload:\n${result.payloadJson}`
        : result.payloadJson
      await window.api.ui.writeClipboardText(text)
      if (mountedRef.current) {
        toast.success(
          result.command
            ? translate(
                'auto.components.settings.EphemeralVmRuntimesSection.copiedCleanupCommand',
                'Copied cleanup command.'
              )
            : translate(
                'auto.components.settings.EphemeralVmRuntimesSection.copiedCleanupPayload',
                'Copied cleanup payload.'
              )
        )
      }
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.EphemeralVmRuntimesSection.copyCleanupFailed',
                'Couldn’t copy cleanup command.'
              )
        )
      }
    }
  }

  const hasRuntimes = runtimes.length > 0
  return (
    <div className="space-y-3 pt-2" data-settings-section="temporary-vm-runtimes">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">
            {translate(
              'auto.components.settings.EphemeralVmRuntimesSection.title',
              'Temporary VM runtimes'
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.EphemeralVmRuntimesSection.description',
              'Recipe-created runtimes are workspace-owned. Clean up stale entries after crashes, failed creates, or manual recovery.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={translate(
            'auto.components.settings.EphemeralVmRuntimesSection.refresh',
            'Refresh temporary VM runtimes'
          )}
          title={translate(
            'auto.components.settings.EphemeralVmRuntimesSection.refresh',
            'Refresh temporary VM runtimes'
          )}
          onClick={() => void refresh()}
          disabled={isLoading || cleaningId !== null}
        >
          {isLoading ? <LoadingIndicator /> : <RefreshCw />}
        </Button>
      </div>

      <div className="border-border/50 bg-card/30 rounded-lg border">
        {!hasRuntimes ? (
          <div className="text-muted-foreground px-3 py-4 text-sm">
            {isLoading
              ? translate(
                  'auto.components.settings.EphemeralVmRuntimesSection.loading',
                  'Checking temporary VM runtimes…'
                )
              : translate(
                  'auto.components.settings.EphemeralVmRuntimesSection.empty',
                  'No temporary VM runtimes need cleanup.'
                )}
          </div>
        ) : (
          <div className="divide-border/50 divide-y">
            {runtimes.map((runtime) => (
              <EphemeralVmRuntimeRow
                key={runtime.id}
                runtime={runtime}
                isCleaning={cleaningId === runtime.id}
                disabled={cleaningId !== null || isLoading}
                onCleanup={() => void cleanupRuntime(runtime)}
                onCopyCleanupCommand={() => void copyCleanupCommand(runtime)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EphemeralVmRuntimeRow({
  runtime,
  isCleaning,
  disabled,
  onCleanup,
  onCopyCleanupCommand
}: {
  runtime: EphemeralVmRuntimeRecord
  isCleaning: boolean
  disabled: boolean
  onCleanup: () => void
  onCopyCleanupCommand: () => void
}): React.JSX.Element {
  const statusLabel = getEphemeralVmRuntimeStatusLabel(runtime)
  const hasError = runtime.cleanupStatus === 'failed' || runtime.status === 'failed'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={cn(
          'size-2 shrink-0 rounded-full',
          hasError ? 'bg-destructive' : 'bg-muted-foreground/40'
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">
            {runtime.workspaceName || runtime.recipeId}
          </div>
          <span className="text-muted-foreground shrink-0 text-[11px]">{statusLabel}</span>
          {hasError ? <AlertTriangle className="text-destructive size-3.5 shrink-0" /> : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {runtime.recipeId} · {getEphemeralVmRecipeResultProjectRoot(runtime.recipeResult)}
        </p>
        {runtime.cleanupLastError ? (
          <p className="text-destructive mt-0.5 truncate text-xs">{runtime.cleanupLastError}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {runtime.cleanupStatus === 'failed' ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground gap-1.5"
            onClick={onCopyCleanupCommand}
            disabled={disabled}
          >
            <Copy className="size-3" />
            {translate(
              'auto.components.settings.EphemeralVmRuntimesSection.copyCleanup',
              'Copy command'
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-foreground gap-1.5"
          onClick={onCleanup}
          disabled={disabled}
        >
          {isCleaning ? <LoadingIndicator className="size-3" /> : <Trash2 className="size-3" />}
          {runtime.cleanupStatus === 'failed'
            ? translate(
                'auto.components.settings.EphemeralVmRuntimesSection.retry',
                'Retry cleanup'
              )
            : translate('auto.components.settings.EphemeralVmRuntimesSection.cleanup', 'Cleanup')}
        </Button>
      </div>
    </div>
  )
}
