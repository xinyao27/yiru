type ShellAppStartupService = {
  awaitFirstWindowStartupServices: () => Promise<void>
  startupDiagnostic: (event: string, details?: Record<string, unknown>) => void
}

let shellAppStartupService: ShellAppStartupService | null = null

export function initializeShellAppStartupService(service: ShellAppStartupService): void {
  shellAppStartupService = service
}

export function getShellAppStartupService(): ShellAppStartupService {
  if (!shellAppStartupService) {
    throw new Error('shell_app_startup_service_unavailable')
  }
  return shellAppStartupService
}
