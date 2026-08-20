export const COWORKING_AVAILABILITY_DIAGNOSTICS = [
  'tailscale_unavailable',
  'tailscale_not-running',
  'tailscale_permission-denied',
  'tailscale_timed-out',
  'tailscale_unsupported-output',
  'coworking_port_unavailable',
  'coworking_permission_denied',
  'persistence_unavailable',
  'coworking_windows_firewall_unavailable',
  'coworking_unavailable'
] as const

export type CoworkingAvailabilityDiagnostic = (typeof COWORKING_AVAILABILITY_DIAGNOSTICS)[number]

const COWORKING_AVAILABILITY_DIAGNOSTIC_SET: ReadonlySet<string> = new Set(
  COWORKING_AVAILABILITY_DIAGNOSTICS
)

export function projectCoworkingAvailabilityDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): CoworkingAvailabilityDiagnostic | null {
  // Why: a firewall-blocked listener used to be filtered out here because the
  // pull-based notice inside the Coworking panel owned it. That notice is
  // unreachable for anyone who never opens the panel, so the status bar now
  // carries it too — with a repair action instead of a re-probe.
  if (status !== 'unavailable') {
    return null
  }
  // Why: diagnostics cross the main/renderer trust boundary; unknown values
  // get generic copy instead of becoming renderer-visible implementation data.
  return diagnostic && COWORKING_AVAILABILITY_DIAGNOSTIC_SET.has(diagnostic)
    ? (diagnostic as CoworkingAvailabilityDiagnostic)
    : 'coworking_unavailable'
}
