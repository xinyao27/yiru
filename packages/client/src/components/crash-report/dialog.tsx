import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { lazyWithRetry as lazy } from '~renderer/lib/lazy-with-retry'
import {
  RENDERER_ERROR_REPORT_AVAILABLE_EVENT,
  takePendingRendererErrorReport
} from '~renderer/lib/renderer-error-reporting'
import { shellClient } from '~renderer/runtime/shell-client'
import type { CrashReportRecord } from '~shared/crash-reporting'

const CrashReportDialogSurface = lazy(() =>
  import('./dialog-surface').then((module) => ({
    default: module.CrashReportDialogSurface
  }))
)

export function CrashReportDialog(): React.JSX.Element | null {
  const promptedThisLaunch = useRef(false)
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<CrashReportRecord | null>(null)
  const [loading, setLoading] = useState(false)

  const openCrashReport = useCallback((nextReport: CrashReportRecord): void => {
    setReport(nextReport)
    setOpen(true)
  }, [])

  const loadCrashReport = useCallback(
    async (promptIfPresent: boolean): Promise<void> => {
      setLoading(true)
      try {
        const nextReport = promptIfPresent
          ? await shellClient.crashReports.getLatestPending()
          : await shellClient.crashReports.getLatestReport()
        let displayedReport = nextReport
        if (nextReport?.status === 'pending' && promptIfPresent) {
          try {
            // Why: startup crash prompts are one-shot. The lazy dialog keeps the
            // report data locally if the user sends immediately, while Help >
            // Report Crash can still reopen dismissed unsent reports.
            await shellClient.crashReports.dismiss({ reportId: nextReport.id })
            displayedReport = { ...nextReport, status: 'dismissed' as const }
          } catch (error) {
            console.error('Failed to dismiss crash report after startup prompt:', error)
          }
        }
        if (!mountedRef.current) {
          return
        }
        setReport(displayedReport)
        if (nextReport && promptIfPresent) {
          setOpen(true)
        }
      } catch (error) {
        console.error('Failed to load crash report:', error)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    if (promptedThisLaunch.current) {
      return
    }
    promptedThisLaunch.current = true
    void loadCrashReport(true)
  }, [loadCrashReport])

  useEffect(() => {
    return shellClient.ui.onOpenCrashReport(() => {
      setReport(null)
      setOpen(true)
      void loadCrashReport(false)
    })
  }, [loadCrashReport])

  useEffect(() => {
    const pendingReport = takePendingRendererErrorReport()
    if (pendingReport) {
      openCrashReport(pendingReport)
    }

    const onRendererErrorReport = (): void => {
      const nextReport = takePendingRendererErrorReport()
      if (nextReport) {
        openCrashReport(nextReport)
      }
    }

    window.addEventListener(RENDERER_ERROR_REPORT_AVAILABLE_EVENT, onRendererErrorReport)
    return () => {
      window.removeEventListener(RENDERER_ERROR_REPORT_AVAILABLE_EVENT, onRendererErrorReport)
    }
  }, [openCrashReport])

  if (!open) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <CrashReportDialogSurface
        open={open}
        report={report}
        loading={loading}
        onOpenChange={setOpen}
        onReportChange={setReport}
      />
    </Suspense>
  )
}
