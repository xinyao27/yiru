import type { BrowserPageHandle } from './handle'

type BrowserPageRegistration = {
  handle: BrowserPageHandle
  unsubscribeClosed: () => void
}

export class BrowserPageRegistry {
  private readonly registrationsByPageId = new Map<string, BrowserPageRegistration>()
  private readonly pageIdByBackendPageId = new Map<string, string>()

  register(handle: BrowserPageHandle): BrowserPageHandle | null {
    const { backendPageId, browserPageId } = handle.identity
    const backendOwner = this.pageIdByBackendPageId.get(backendPageId)
    if (backendOwner && backendOwner !== browserPageId) {
      throw new Error(`Browser backend page ${backendPageId} is already registered`)
    }

    const previous = this.registrationsByPageId.get(browserPageId)
    if (previous?.handle === handle) {
      return previous.handle
    }
    if (handle.isClosed()) {
      throw new Error(`Cannot register closed browser page ${browserPageId}`)
    }

    const registration: BrowserPageRegistration = {
      handle,
      unsubscribeClosed: () => {}
    }
    registration.unsubscribeClosed = handle.subscribe((event) => {
      if (
        event.type === 'closed' &&
        this.registrationsByPageId.get(browserPageId) === registration
      ) {
        this.removeRegistration(registration)
      }
    })
    if (handle.isClosed()) {
      registration.unsubscribeClosed()
      throw new Error(`Cannot register closed browser page ${browserPageId}`)
    }
    if (previous) {
      this.removeRegistration(previous)
    }
    this.registrationsByPageId.set(browserPageId, registration)
    this.pageIdByBackendPageId.set(backendPageId, browserPageId)
    return previous?.handle ?? null
  }

  get(browserPageId: string): BrowserPageHandle | null {
    const registration = this.registrationsByPageId.get(browserPageId)
    if (!registration) {
      return null
    }
    if (registration.handle.isClosed()) {
      this.unregister(browserPageId, registration.handle.identity.backendPageId)
      return null
    }
    return registration.handle
  }

  getByBackendPageId(backendPageId: string): BrowserPageHandle | null {
    const browserPageId = this.pageIdByBackendPageId.get(backendPageId)
    return browserPageId ? this.get(browserPageId) : null
  }

  list(): BrowserPageHandle[] {
    const handles: BrowserPageHandle[] = []
    for (const browserPageId of this.registrationsByPageId.keys()) {
      const handle = this.get(browserPageId)
      if (handle) {
        handles.push(handle)
      }
    }
    return handles
  }

  unregister(browserPageId: string, expectedBackendPageId?: string): BrowserPageHandle | null {
    const registration = this.registrationsByPageId.get(browserPageId)
    if (
      !registration ||
      (expectedBackendPageId !== undefined &&
        registration.handle.identity.backendPageId !== expectedBackendPageId)
    ) {
      return null
    }
    this.removeRegistration(registration)
    return registration.handle
  }

  clear(): void {
    for (const registration of this.registrationsByPageId.values()) {
      registration.unsubscribeClosed()
    }
    this.registrationsByPageId.clear()
    this.pageIdByBackendPageId.clear()
  }

  private removeRegistration(registration: BrowserPageRegistration): void {
    const { backendPageId, browserPageId } = registration.handle.identity
    registration.unsubscribeClosed()
    if (this.registrationsByPageId.get(browserPageId) === registration) {
      this.registrationsByPageId.delete(browserPageId)
    }
    if (this.pageIdByBackendPageId.get(backendPageId) === browserPageId) {
      this.pageIdByBackendPageId.delete(backendPageId)
    }
  }
}
