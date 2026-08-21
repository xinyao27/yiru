export const WEB_CONNECT_URL_SCHEME = 'yiru'

export type WebConnectDeepLink = {
  desktopNonce: string | null
  grant: string
}

// Why: the app is registered for the whole `yiru://` scheme, so this must accept
// only the connect route and reject everything else rather than treating any
// deep link as a pairing attempt.
export function parseWebConnectDeepLink(value: string): WebConnectDeepLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== `${WEB_CONNECT_URL_SCHEME}:`) {
    return null
  }
  // Why: `yiru://connect?x` parses the authority as the host, while
  // `yiru:connect?x` puts it in the pathname — accept both spellings.
  const route = (url.host || url.pathname.replace(/^\/+/, '')).toLowerCase()
  if (route !== 'connect') {
    return null
  }
  const grant = url.searchParams.get('grant')?.trim()
  if (!grant) {
    return null
  }
  const desktopNonce = url.searchParams.get('desktop')?.trim()
  return { desktopNonce: desktopNonce && desktopNonce.length > 0 ? desktopNonce : null, grant }
}

// Why: macOS delivers deep links through `open-url`, but Windows and Linux hand
// them over as a launch argument, where they sit among Electron's own flags.
export function findWebConnectDeepLinkArgument(argv: readonly string[]): string | null {
  for (const argument of argv) {
    if (parseWebConnectDeepLink(argument)) {
      return argument
    }
  }
  return null
}
