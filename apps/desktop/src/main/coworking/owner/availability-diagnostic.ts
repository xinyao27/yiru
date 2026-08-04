export function projectCoworkingAvailabilityDiagnostic(error: unknown): string {
  const code = errorCode(error)
  if (code === 'EADDRINUSE') {
    return 'coworking_port_unavailable'
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return 'coworking_permission_denied'
  }
  if (error instanceof Error && /^tailscale_[a-z-]+$/.test(error.message)) {
    return error.message
  }
  if (error instanceof Error && error.message === 'coworking_windows_firewall_unavailable') {
    return error.message
  }
  return 'coworking_unavailable'
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}
