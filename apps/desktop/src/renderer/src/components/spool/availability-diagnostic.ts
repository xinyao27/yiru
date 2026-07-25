export const SPOOL_AVAILABILITY_DIAGNOSTICS = [
  'tailscale_unavailable',
  'tailscale_not-running',
  'tailscale_permission-denied',
  'tailscale_timed-out',
  'tailscale_unsupported-output',
  'spool_port_unavailable',
  'spool_permission_denied',
  'persistence_unavailable',
  'spool_unavailable'
] as const

export type SpoolAvailabilityDiagnostic = (typeof SPOOL_AVAILABILITY_DIAGNOSTICS)[number]

const SPOOL_AVAILABILITY_DIAGNOSTIC_SET: ReadonlySet<string> = new Set(
  SPOOL_AVAILABILITY_DIAGNOSTICS
)

export function projectSpoolAvailabilityDiagnostic(
  status: 'starting' | 'ready' | 'unavailable',
  diagnostic: string | null
): SpoolAvailabilityDiagnostic | null {
  if (status !== 'unavailable' || diagnostic === 'spool_windows_firewall_unavailable') {
    return null
  }
  // Why: diagnostics cross the main/renderer trust boundary; unknown values
  // get generic copy instead of becoming renderer-visible implementation data.
  return diagnostic && SPOOL_AVAILABILITY_DIAGNOSTIC_SET.has(diagnostic)
    ? (diagnostic as SpoolAvailabilityDiagnostic)
    : 'spool_unavailable'
}
