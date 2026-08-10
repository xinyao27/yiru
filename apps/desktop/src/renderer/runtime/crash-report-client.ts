import type { CrashReportBreadcrumbData } from '~shared/crash-reporting'

/** Best-effort crash evidence recording; must never create or mask failures. */
export function recordRendererCrashReportBreadcrumb(
  name: string,
  data?: CrashReportBreadcrumbData
): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.api.crashReports.recordBreadcrumb({ name, ...(data ? { data } : {}) })
  } catch {
    // Why: crash evidence is diagnostic only and can race renderer teardown.
  }
}
