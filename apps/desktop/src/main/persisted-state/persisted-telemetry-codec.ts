import type { GlobalSettings } from '../../shared/types'

type TelemetrySettings = GlobalSettings['telemetry']

export function decodePersistedTelemetry(
  existing: TelemetrySettings,
  fileExistedOnLoad: boolean,
  createInstallId: () => string
): TelemetrySettings {
  if (
    typeof existing?.existedBeforeTelemetryRelease === 'boolean' &&
    typeof existing.installId === 'string' &&
    existing.installId.length > 0 &&
    (existing.optedIn === true || existing.optedIn === false || existing.optedIn === null)
  ) {
    return existing
  }

  const existedBeforeTelemetryRelease =
    typeof existing?.existedBeforeTelemetryRelease === 'boolean'
      ? existing.existedBeforeTelemetryRelease
      : fileExistedOnLoad

  return {
    ...existing,
    existedBeforeTelemetryRelease,
    optedIn:
      existing?.optedIn === true || existing?.optedIn === false || existing?.optedIn === null
        ? existing.optedIn
        : existedBeforeTelemetryRelease
          ? null
          : true,
    installId:
      typeof existing?.installId === 'string' && existing.installId.length > 0
        ? existing.installId
        : createInstallId()
  }
}
