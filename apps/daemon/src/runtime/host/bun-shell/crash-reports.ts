import { CrashReportService } from '~main/crash-reporting/service'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellCrashReportHandlers(userDataPath: string) {
  const reports = new CrashReportService(userDataPath)
  return {
    crashReports: {
      getLatestPending: runtimeImplementation.shell.crashReports.getLatestPending.handler(() =>
        reports.getLatestPending()
      ),
      getLatestReport: runtimeImplementation.shell.crashReports.getLatestReport.handler(() =>
        reports.getLatestReport()
      ),
      dismiss: runtimeImplementation.shell.crashReports.dismiss.handler(({ input }) =>
        reports.dismiss(input.reportId)
      ),
      recordRendererError: runtimeImplementation.shell.crashReports.recordRendererError.handler(
        ({ input }) => reports.recordRendererError(input)
      ),
      recordBreadcrumb: runtimeImplementation.shell.crashReports.recordBreadcrumb.handler(
        ({ input }) => reports.recordBreadcrumb(input)
      ),
      submit: runtimeImplementation.shell.crashReports.submit.handler(({ input }) =>
        reports.submit(input)
      ),
      copyLatestDiagnostics: runtimeImplementation.shell.crashReports.copyLatestDiagnostics.handler(
        ({ input }) => reports.copyLatestDiagnostics(input)
      )
    }
  }
}
