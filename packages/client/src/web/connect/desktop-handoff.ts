const DESKTOP_SESSION_HASH_KEY = 'desktop'

export function webConnectDeepLink(grant: string, desktopNonce: string | null): string {
  const link = new URL('yiru://connect')
  link.searchParams.set('grant', grant)
  if (desktopNonce) {
    link.searchParams.set(DESKTOP_SESSION_HASH_KEY, desktopNonce)
  }
  return link.toString()
}

// Why: the app puts its one-time nonce in the fragment, which browsers never send
// to the server — the pairing loop stays between this page and the local app.
export function readDesktopSessionNonce(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash.length === 0) {
    return null
  }
  const nonce = new URLSearchParams(hash).get(DESKTOP_SESSION_HASH_KEY)?.trim()
  return nonce && nonce.length > 0 ? nonce : null
}

export function openDesktopPairing(grant: string, desktopNonce: string | null): void {
  // Why: the nonce is single-use, so it must not survive a reload — clearing the
  // fragment first stops a refresh from replaying a grant the app already spent.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  window.location.href = webConnectDeepLink(grant, desktopNonce)
}
