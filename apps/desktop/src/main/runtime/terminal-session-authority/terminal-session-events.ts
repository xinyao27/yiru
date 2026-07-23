import type { RuntimeTerminalDriverState } from '../../../shared/runtime-types'

export type TerminalDataMeta = { seq?: number; rawLength?: number; cwd?: string }
export type TerminalFitMode = 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
export type TerminalFitEvent = { mode: TerminalFitMode; cols: number; rows: number }
export type TerminalResizeEvent = {
  cols: number
  rows: number
  displayMode: string
  reason: string
  seq?: number
}

type TerminalSessionEventPort = {
  notifyRemoteViewPresence(ptyId: string): void
  notifyDriverChanged(ptyId: string, driver: RuntimeTerminalDriverState): void
}

function subscribeToKey<T>(
  listenersByPty: Map<string, Set<(event: T) => void>>,
  ptyId: string,
  listener: (event: T) => void
): () => void {
  let listeners = listenersByPty.get(ptyId)
  if (!listeners) {
    listeners = new Set()
    listenersByPty.set(ptyId, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      listenersByPty.delete(ptyId)
    }
  }
}

export class TerminalSessionEvents {
  private readonly dataListeners = new Map<
    string,
    Set<(data: string, meta?: TerminalDataMeta) => void>
  >()
  private readonly fitListeners = new Map<string, Set<(event: TerminalFitEvent) => void>>()
  private readonly driverListeners = new Map<
    string,
    Set<(driver: RuntimeTerminalDriverState) => void>
  >()
  private readonly resizeListeners = new Map<string, Set<(event: TerminalResizeEvent) => void>>()
  private readonly remoteViewCounts = new Map<string, number>()
  private readonly drivers = new Map<string, RuntimeTerminalDriverState>()

  constructor(private readonly port: TerminalSessionEventPort) {}

  subscribeData(
    ptyId: string,
    listener: (data: string, meta?: TerminalDataMeta) => void
  ): () => void {
    let listeners = this.dataListeners.get(ptyId)
    if (!listeners) {
      listeners = new Set()
      this.dataListeners.set(ptyId, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.dataListeners.delete(ptyId)
      }
    }
  }

  emitData(ptyId: string, data: string, meta?: TerminalDataMeta): void {
    for (const listener of this.dataListeners.get(ptyId) ?? []) {
      listener(data, meta)
    }
  }

  subscribeFit(ptyId: string, listener: (event: TerminalFitEvent) => void): () => void {
    return subscribeToKey(this.fitListeners, ptyId, listener)
  }

  emitFit(ptyId: string, event: TerminalFitEvent): void {
    for (const listener of this.fitListeners.get(ptyId) ?? []) {
      listener(event)
    }
  }

  subscribeDriver(
    ptyId: string,
    listener: (driver: RuntimeTerminalDriverState) => void
  ): () => void {
    return subscribeToKey(this.driverListeners, ptyId, listener)
  }

  getDriver(ptyId: string): RuntimeTerminalDriverState {
    return this.drivers.get(ptyId) ?? { kind: 'idle' }
  }

  getDrivers(): Map<string, RuntimeTerminalDriverState> {
    return new Map(this.drivers)
  }

  setDriver(ptyId: string, next: RuntimeTerminalDriverState): void {
    const previous = this.getDriver(ptyId)
    if (previous.kind === next.kind) {
      if (
        previous.kind === 'mobile' &&
        next.kind === 'mobile' &&
        previous.clientId === next.clientId
      ) {
        return
      }
      if (previous.kind !== 'mobile' && next.kind !== 'mobile') {
        return
      }
    }
    if (next.kind === 'idle') {
      this.drivers.delete(ptyId)
    } else {
      this.drivers.set(ptyId, next)
    }
    this.port.notifyDriverChanged(ptyId, next)
    for (const listener of this.driverListeners.get(ptyId) ?? []) {
      listener(next)
    }
  }

  clearDriver(ptyId: string): void {
    if (this.drivers.has(ptyId)) {
      this.setDriver(ptyId, { kind: 'idle' })
    }
  }

  subscribeResize(ptyId: string, listener: (event: TerminalResizeEvent) => void): () => void {
    return subscribeToKey(this.resizeListeners, ptyId, listener)
  }

  emitResize(ptyId: string, event: TerminalResizeEvent): void {
    for (const listener of this.resizeListeners.get(ptyId) ?? []) {
      listener(event)
    }
  }

  registerRemoteView(ptyId: string): () => void {
    this.remoteViewCounts.set(ptyId, (this.remoteViewCounts.get(ptyId) ?? 0) + 1)
    this.port.notifyRemoteViewPresence(ptyId)
    let released = false
    return () => {
      if (released) {
        return
      }
      released = true
      const next = (this.remoteViewCounts.get(ptyId) ?? 1) - 1
      if (next <= 0) {
        this.remoteViewCounts.delete(ptyId)
      } else {
        this.remoteViewCounts.set(ptyId, next)
      }
      this.port.notifyRemoteViewPresence(ptyId)
    }
  }

  hasRemoteView(ptyId: string): boolean {
    return (this.remoteViewCounts.get(ptyId) ?? 0) > 0
  }

  clearPtyTransientState(ptyId: string): void {
    this.remoteViewCounts.delete(ptyId)
    this.resizeListeners.delete(ptyId)
  }
}
