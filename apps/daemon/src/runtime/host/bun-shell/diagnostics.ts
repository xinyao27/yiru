import { createDiagnosticsService } from '~main/diagnostics/service'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellDiagnosticsHandlers(openFile: (path: string) => Promise<boolean>) {
  const diagnostics = createDiagnosticsService(openFile)
  return {
    diagnostics: {
      getStatus: runtimeImplementation.shell.diagnostics.getStatus.handler(() =>
        diagnostics.getStatus()
      ),
      collectBundle: runtimeImplementation.shell.diagnostics.collectBundle.handler(({ input }) =>
        diagnostics.collect(input?.lookbackMinutes)
      ),
      openBundlePreview: runtimeImplementation.shell.diagnostics.openBundlePreview.handler(
        ({ input }) => diagnostics.openPreview(input.bundleSubmissionId)
      ),
      discardBundlePreview: runtimeImplementation.shell.diagnostics.discardBundlePreview.handler(
        ({ input }) => diagnostics.discard(input.bundleSubmissionId)
      ),
      uploadBundle: runtimeImplementation.shell.diagnostics.uploadBundle.handler(({ input }) =>
        diagnostics.upload(input.bundleSubmissionId)
      )
    }
  }
}
