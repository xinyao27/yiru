export const BROWSER_CLICKED_LINK_ROUTING_WORLD_ID = 1208

type BrowserClickedLinkRoutingState = {
  externalFrameName: string
  yiruFrameName: string
  isMac: boolean
  allowUntrustedEvents: boolean
  listener: (event: MouseEvent) => void
}

type BrowserClickedLinkRoutingGlobal = typeof globalThis & {
  __yiruBrowserClickedLinkRouting?: BrowserClickedLinkRoutingState
}

/**
 * Re-expresses explicit new-tab link gestures with private frame names so main
 * can distinguish them from opener-dependent window.open calls.
 */
export function installBrowserClickedLinkRouting(
  yiruFrameName: string,
  externalFrameName: string,
  isMac: boolean,
  allowUntrustedEvents = false
): void {
  const routingGlobal = globalThis as BrowserClickedLinkRoutingGlobal
  const existing = routingGlobal.__yiruBrowserClickedLinkRouting
  if (existing) {
    existing.yiruFrameName = yiruFrameName
    existing.externalFrameName = externalFrameName
    existing.isMac = isMac
    existing.allowUntrustedEvents = allowUntrustedEvents
    return
  }

  const state: BrowserClickedLinkRoutingState = {
    yiruFrameName,
    externalFrameName,
    isMac,
    allowUntrustedEvents,
    listener: () => {}
  }
  state.listener = (event) => {
    const primaryClick = event.type === 'click' && event.button === 0
    const middleClick = event.type === 'auxclick' && event.button === 1
    if (
      !(event instanceof MouseEvent) ||
      (!event.isTrusted && !state.allowUntrustedEvents) ||
      (!primaryClick && !middleClick) ||
      event.defaultPrevented ||
      event.altKey
    ) {
      return
    }

    const link = event
      .composedPath()
      .find(
        (target): target is Element =>
          target instanceof Element &&
          ((target.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
            (target.localName === 'a' || target.localName === 'area')) ||
            (target.namespaceURI === 'http://www.w3.org/2000/svg' && target.localName === 'a'))
      )
    if (!link || link.hasAttribute('download')) {
      return
    }

    const modifierClick = state.isMac ? event.metaKey : event.ctrlKey
    const otherPlatformModifier = state.isMac ? event.ctrlKey : event.metaKey
    if (otherPlatformModifier) {
      return
    }
    const baseTarget = document.querySelector('base[target]')?.getAttribute('target') ?? ''
    const ownTarget = link.getAttribute('target')
    const effectiveTarget = (ownTarget === null ? baseTarget : ownTarget).trim().toLowerCase()
    const opensNewContext = middleClick || modifierClick || event.shiftKey
    const targetOpensNewContext =
      effectiveTarget !== '' &&
      effectiveTarget !== '_self' &&
      effectiveTarget !== '_top' &&
      effectiveTarget !== '_parent'
    if (!opensNewContext && !targetOpensNewContext) {
      return
    }

    const rawHref =
      link.getAttribute('href') ?? link.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (rawHref === null) {
      return
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(rawHref, document.baseURI)
    } catch {
      return
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return
    }

    // Why: private frame names let main distinguish a Command/Ctrl+left click
    // from every other anchor request for a new browsing context.
    event.preventDefault()
    window.open(
      targetUrl.toString(),
      primaryClick && modifierClick ? state.yiruFrameName : state.externalFrameName
    )
  }
  routingGlobal.__yiruBrowserClickedLinkRouting = state

  // Why: page click handlers must get the first chance to cancel or rewrite a
  // link; capture-phase interception breaks SPA routing and analytics handlers.
  window.addEventListener('click', state.listener, false)
  window.addEventListener('auxclick', state.listener, false)
}

/**
 * Routes child-frame links with one-use tokens that page code cannot replay.
 */
export function installBrowserIframeClickedLinkRouting(
  yiruFrameName: string,
  externalFrameName: string,
  isMac: boolean,
  allowUntrustedEvents = false
): () => void {
  const listener = (event: MouseEvent): void => {
    const primaryClick = event.type === 'click' && event.button === 0
    const middleClick = event.type === 'auxclick' && event.button === 1
    if (
      !(event instanceof MouseEvent) ||
      (!event.isTrusted && !allowUntrustedEvents) ||
      (!primaryClick && !middleClick) ||
      event.defaultPrevented ||
      event.altKey
    ) {
      return
    }

    const link = event
      .composedPath()
      .find(
        (target): target is Element =>
          target instanceof Element &&
          ((target.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
            (target.localName === 'a' || target.localName === 'area')) ||
            (target.namespaceURI === 'http://www.w3.org/2000/svg' && target.localName === 'a'))
      )
    if (!link || link.hasAttribute('download')) {
      return
    }

    const modifierClick = isMac ? event.metaKey : event.ctrlKey
    const otherPlatformModifier = isMac ? event.ctrlKey : event.metaKey
    if (otherPlatformModifier) {
      return
    }

    const baseTarget = document.querySelector('base[target]')?.getAttribute('target') ?? ''
    const ownTarget = link.getAttribute('target')
    const effectiveTarget = (ownTarget === null ? baseTarget : ownTarget).trim().toLowerCase()
    const opensNewContext = middleClick || modifierClick || event.shiftKey
    const targetOpensNewContext =
      effectiveTarget !== '' &&
      effectiveTarget !== '_self' &&
      effectiveTarget !== '_top' &&
      effectiveTarget !== '_parent'
    if (!opensNewContext && !targetOpensNewContext) {
      return
    }

    const rawHref =
      link.getAttribute('href') ?? link.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (rawHref === null) {
      return
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(rawHref, document.baseURI)
    } catch {
      return
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return
    }

    // Why: child-frame code runs in the page world, so each token is one-use.
    // A page that observes a real click cannot replay it to create more tabs.
    event.preventDefault()
    cleanup()
    window.open(
      targetUrl.toString(),
      primaryClick && modifierClick ? yiruFrameName : externalFrameName
    )
  }

  const cleanup = (): void => {
    window.removeEventListener('click', listener, false)
    window.removeEventListener('auxclick', listener, false)
  }
  window.addEventListener('click', listener, false)
  window.addEventListener('auxclick', listener, false)
  return cleanup
}

export function buildBrowserClickedLinkRoutingScript(
  yiruFrameName: string,
  externalFrameName: string,
  isMac: boolean
): string {
  return `(${installBrowserClickedLinkRouting.toString()})(${JSON.stringify(yiruFrameName)},${JSON.stringify(externalFrameName)},${JSON.stringify(isMac)});`
}

export function buildBrowserIframeClickedLinkRoutingScript(
  yiruFrameName: string,
  externalFrameName: string,
  isMac: boolean
): string {
  return `void (${installBrowserIframeClickedLinkRouting.toString()})(${JSON.stringify(yiruFrameName)},${JSON.stringify(externalFrameName)},${JSON.stringify(isMac)});`
}
