export function isWebClientLocation(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return (
    Boolean((window as unknown as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__) ||
    window.location.pathname.endsWith('/web-index.html')
  )
}
