export const COWORKING_AVAILABILITY_DIAGNOSTICS = [
  'tailscale_unavailable',
  'tailscale_not-running',
  'tailscale_permission-denied',
  'tailscale_timed-out',
  'tailscale_unsupported-output',
  'coworking_port_unavailable',
  'coworking_permission_denied',
  'persistence_unavailable',
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
  if (status !== 'unavailable' || diagnostic === 'coworking_windows_firewall_unavailable') {
    return null
  }
  // Why: diagnostics cross the main/renderer trust boundary; unknown values
  // get generic copy instead of becoming renderer-visible implementation data.
  return diagnostic && COWORKING_AVAILABILITY_DIAGNOSTIC_SET.has(diagnostic)
    ? (diagnostic as CoworkingAvailabilityDiagnostic)
    : 'coworking_unavailable'
}
