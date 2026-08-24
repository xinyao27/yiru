export class CdpClientSessions {
  private readonly browserSessionIds = new Set<string>()
  private currentPageSessionId: string | undefined
  private nextBrowserSessionOrdinal = 0
  private nextPageSessionOrdinal = 0
  private readonly pageSessionIds = new Set<string>()

  currentSessionId(): string | undefined {
    return this.currentPageSessionId
  }

  clear(): void {
    this.currentPageSessionId = undefined
    this.pageSessionIds.clear()
    this.browserSessionIds.clear()
    this.nextPageSessionOrdinal = 0
    this.nextBrowserSessionOrdinal = 0
  }

  attachBrowser(): string {
    this.nextBrowserSessionOrdinal += 1
    const sessionId =
      this.nextBrowserSessionOrdinal === 1
        ? 'yiru-proxy-browser-session'
        : `yiru-proxy-browser-session-${this.nextBrowserSessionOrdinal}`
    this.browserSessionIds.add(sessionId)
    return sessionId
  }

  attachPage(): string {
    this.nextPageSessionOrdinal += 1
    const sessionId =
      this.nextPageSessionOrdinal === 1
        ? 'yiru-proxy-session'
        : `yiru-proxy-session-${this.nextPageSessionOrdinal}`
    this.pageSessionIds.add(sessionId)
    this.currentPageSessionId ??= sessionId
    return sessionId
  }

  detach(sessionId: unknown): void {
    if (typeof sessionId !== 'string') {
      return
    }
    this.pageSessionIds.delete(sessionId)
    this.browserSessionIds.delete(sessionId)
    if (sessionId === this.currentPageSessionId) {
      this.currentPageSessionId = this.pageSessionIds.values().next().value
    }
  }

  resolveDebuggerSessionId(messageSessionId?: string): string | undefined {
    const isSynthetic =
      messageSessionId !== undefined &&
      (this.pageSessionIds.has(messageSessionId) || this.browserSessionIds.has(messageSessionId))
    return messageSessionId && !isSynthetic ? messageSessionId : undefined
  }
}
