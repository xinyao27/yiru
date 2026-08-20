import { BrowserWindow } from 'electron'
import {
  markShellAutomationDispatchResult,
  markShellAutomationRendererReady,
  runShellAutomationPrecheck
} from '~main/automations/shell-service'
import {
  copyLatestShellCrashDiagnostics,
  dismissShellCrashReport,
  getLatestPendingShellCrashReport,
  getLatestShellCrashReport,
  recordShellCrashBreadcrumb,
  recordShellRendererError,
  submitShellCrashReport
} from '~main/crash-reporting/crash-reporting'
import { submitShellFeedback } from '~main/crash-reporting/feedback'
import {
  getShellDeveloperPermissionStatus,
  requestShellDeveloperPermission
} from '~main/developer-permissions'
import { getShellDiagnosticsService } from '~main/diagnostics/diagnostics'
import { exportShellHtmlToPdf } from '~main/export/export'
import {
  getOrCreateShellFridaySession,
  restartShellFridaySession
} from '~main/friday/shell-service'
import { getShellMiniMaxCredentialsService } from '~main/minimax/credentials'
import { getShellMobileService } from '~main/mobile/shell-service'
import { getShellPetService } from '~main/pet/pet'
import { registerShellLocalhostWorktreeLabel } from '~main/ports/localhost-worktree-labels'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import { requireShellRenderer } from '~main/shell/files'
import { ensureShellMicrophoneAccess } from '~main/speech/speech'
import {
  acknowledgeShellTelemetryBanner,
  getShellTelemetryConsentState,
  setShellTelemetryOptIn,
  trackShellTelemetry
} from '~main/telemetry/telemetry'
import type { AutomationDispatchResult } from '~shared/automations-types'
import type { CrashReportCopyDiagnosticsArgs, CrashReportSubmitArgs } from '~shared/crash-reporting'
import type { DeveloperPermissionId } from '~shared/developer-permissions-types'

export const shellToolsRuntimeHandlers = {
  automations: {
    runPrecheck: runtimeImplementation.shell.automations.runPrecheck.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return runShellAutomationPrecheck(
          shellDocument<{ automationId: string; runId: string }>(input, 'invalid_automation')
        )
      }
    ),
    markDispatchResult: runtimeImplementation.shell.automations.markDispatchResult.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return markShellAutomationDispatchResult(
          shellDocument<AutomationDispatchResult>(input, 'invalid_automation_dispatch_result')
        )
      }
    ),
    rendererReady: runtimeImplementation.shell.automations.rendererReady.handler(({ context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      markShellAutomationRendererReady()
    })
  },
  crashReports: {
    getLatestPending: runtimeImplementation.shell.crashReports.getLatestPending.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getLatestPendingShellCrashReport()
      }
    ),
    getLatestReport: runtimeImplementation.shell.crashReports.getLatestReport.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getLatestShellCrashReport()
      }
    ),
    dismiss: runtimeImplementation.shell.crashReports.dismiss.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return dismissShellCrashReport(input)
    }),
    recordRendererError: runtimeImplementation.shell.crashReports.recordRendererError.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return recordShellRendererError(input)
      }
    ),
    recordBreadcrumb: runtimeImplementation.shell.crashReports.recordBreadcrumb.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        recordShellCrashBreadcrumb(
          shellDocument<{ name?: unknown; data?: unknown }>(input, 'invalid_crash_breadcrumb')
        )
      }
    ),
    submit: runtimeImplementation.shell.crashReports.submit.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return submitShellCrashReport(
        shellDocument<CrashReportSubmitArgs>(input, 'invalid_crash_report')
      )
    }),
    copyLatestDiagnostics: runtimeImplementation.shell.crashReports.copyLatestDiagnostics.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return copyLatestShellCrashDiagnostics(
          shellOptionalDocument<CrashReportCopyDiagnosticsArgs>(input, 'invalid_crash_diagnostics')
        )
      }
    )
  },
  diagnostics: {
    getStatus: runtimeImplementation.shell.diagnostics.getStatus.handler(({ context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return getShellDiagnosticsService().getStatus()
    }),
    collectBundle: runtimeImplementation.shell.diagnostics.collectBundle.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellDiagnosticsService().collectBundle(input?.lookbackMinutes)
      }
    ),
    openBundlePreview: runtimeImplementation.shell.diagnostics.openBundlePreview.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellDiagnosticsService().openBundlePreview(input.bundleSubmissionId)
      }
    ),
    discardBundlePreview: runtimeImplementation.shell.diagnostics.discardBundlePreview.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        getShellDiagnosticsService().discardBundlePreview(input.bundleSubmissionId)
      }
    ),
    uploadBundle: runtimeImplementation.shell.diagnostics.uploadBundle.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellDiagnosticsService().uploadBundle(input.bundleSubmissionId)
      }
    )
  },
  telemetry: {
    track: runtimeImplementation.shell.telemetry.track.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      const args = shellDocument<{ name?: unknown; props?: unknown }>(input, 'invalid_telemetry')
      trackShellTelemetry(args.name, args.props)
    }),
    setOptIn: runtimeImplementation.shell.telemetry.setOptIn.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return setShellTelemetryOptIn(input.optedIn)
    }),
    getConsentState: runtimeImplementation.shell.telemetry.getConsentState.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellTelemetryConsentState()
      }
    ),
    acknowledgeBanner: runtimeImplementation.shell.telemetry.acknowledgeBanner.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return acknowledgeShellTelemetryBanner()
      }
    )
  },
  pet: {
    import: runtimeImplementation.shell.pet.import.handler(({ context }) =>
      getShellPetService().import(shellWindow(context.renderingWebContentsId))
    ),
    importPetBundle: runtimeImplementation.shell.pet.importPetBundle.handler(({ context }) =>
      getShellPetService().importPetBundle(shellWindow(context.renderingWebContentsId))
    ),
    read: runtimeImplementation.shell.pet.read.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return getShellPetService().read(input)
    }),
    delete: runtimeImplementation.shell.pet.delete.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return getShellPetService().delete(input)
    })
  },
  minimaxCredentials: {
    getStatus: runtimeImplementation.shell.minimaxCredentials.getStatus.handler(({ context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return getShellMiniMaxCredentialsService().getStatus()
    }),
    saveCookie: runtimeImplementation.shell.minimaxCredentials.saveCookie.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellMiniMaxCredentialsService().saveCookie(input.cookie)
      }
    ),
    clearCookie: runtimeImplementation.shell.minimaxCredentials.clearCookie.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellMiniMaxCredentialsService().clearCookie()
      }
    )
  },
  mobile: {
    getWindowsFirewallStatus: runtimeImplementation.shell.mobile.getWindowsFirewallStatus.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellMobileService().getWindowsFirewallStatus(input?.address)
      }
    ),
    repairWindowsFirewall: runtimeImplementation.shell.mobile.repairWindowsFirewall.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellMobileService().repairWindowsFirewall()
      }
    ),
    openWindowsNetworkSettings:
      runtimeImplementation.shell.mobile.openWindowsNetworkSettings.handler(({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return getShellMobileService().openWindowsNetworkSettings()
      })
  },
  friday: {
    getOrCreate: runtimeImplementation.shell.friday.getOrCreate.handler(({ context }) =>
      getOrCreateShellFridaySession(requireToolRenderer(context.renderingWebContentsId).id)
    ),
    restart: runtimeImplementation.shell.friday.restart.handler(({ context }) =>
      restartShellFridaySession(requireToolRenderer(context.renderingWebContentsId).id)
    )
  },
  developerPermissions: {
    getStatus: runtimeImplementation.shell.developerPermissions.getStatus.handler(({ context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return getShellDeveloperPermissionStatus()
    }),
    request: runtimeImplementation.shell.developerPermissions.request.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        const args = shellDocument<{ id: DeveloperPermissionId }>(
          input,
          'invalid_developer_permission'
        )
        return requestShellDeveloperPermission(args.id)
      }
    )
  },
  feedback: {
    submit: runtimeImplementation.shell.feedback.submit.handler(({ input, context }) => {
      requireToolRenderer(context.renderingWebContentsId)
      return submitShellFeedback(shellDocument(input, 'invalid_feedback'))
    })
  },
  export: {
    htmlToPdf: runtimeImplementation.shell.export.htmlToPdf.handler(({ input, context }) =>
      exportShellHtmlToPdf(
        shellWindow(context.renderingWebContentsId),
        shellDocument(input, 'invalid_export')
      )
    )
  },
  localhostWorktreeLabels: {
    register: runtimeImplementation.shell.localhostWorktreeLabels.register.handler(
      ({ input, context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return registerShellLocalhostWorktreeLabel(input)
      }
    )
  },
  speech: {
    ensureMicrophoneAccess: runtimeImplementation.shell.speech.ensureMicrophoneAccess.handler(
      ({ context }) => {
        requireToolRenderer(context.renderingWebContentsId)
        return ensureShellMicrophoneAccess()
      }
    )
  }
} as const

function shellWindow(webContentsId: number | undefined): BrowserWindow | null {
  return BrowserWindow.fromWebContents(requireToolRenderer(webContentsId))
}

function requireToolRenderer(webContentsId: number | undefined) {
  return requireShellRenderer(webContentsId)
}

function shellOptionalDocument<T>(value: unknown, code: string): T | undefined {
  return value === undefined ? undefined : shellDocument<T>(value, code)
}

function shellDocument<T>(value: unknown, code: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(code)
  }
  return value as T
}
