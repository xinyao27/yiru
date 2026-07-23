import type { RuntimeTerminalDriverState } from '../../../shared/runtime-types'
import { TerminalMobileInputFloor } from './terminal-mobile-input-floor'
import type { TerminalDimensions } from './terminal-session-layout-types'

export type TerminalMobileSubscriber = {
  clientId: string
  viewport: TerminalDimensions | null
  wasResizedToPhone: boolean
  previousCols: number | null
  previousRows: number | null
  subscribedAt: number
  lastActedAt: number
}

export type TerminalMobileSoftLeaver = {
  clientId: string
  timer: ReturnType<typeof setTimeout>
  record: TerminalMobileSubscriber
}

export type TerminalMobileRestoreTimer = {
  timer: ReturnType<typeof setTimeout>
  clientId: string
}

function snapshotSubscriber(subscriber: TerminalMobileSubscriber): TerminalMobileSubscriber {
  return {
    ...subscriber,
    viewport: subscriber.viewport ? { ...subscriber.viewport } : null
  }
}

export class TerminalMobileSessionState {
  private readonly displayModes = new Map<string, 'desktop'>()
  // Why: client-keyed inner maps preserve independent multi-phone lifetimes.
  private readonly subscribers = new Map<string, Map<string, TerminalMobileSubscriber>>()
  private readonly inputFloor = new TerminalMobileInputFloor()
  // Why: short reconnect grace avoids lock flicker and preserves the desktop baseline.
  private readonly softLeavers = new Map<string, TerminalMobileSoftLeaver>()
  // Why: timers are PTY-scoped so simultaneous tab switches cannot overwrite each other.
  private readonly restoreTimers = new Map<string, TerminalMobileRestoreTimer>()

  setDisplayMode(ptyId: string, mode: 'auto' | 'desktop'): void {
    if (mode === 'auto') {
      this.displayModes.delete(ptyId)
    } else {
      this.displayModes.set(ptyId, mode)
    }
  }

  getDisplayMode(ptyId: string): 'auto' | 'desktop' {
    return this.displayModes.get(ptyId) ?? 'auto'
  }

  hasSubscribers(ptyId: string): boolean {
    return (this.subscribers.get(ptyId)?.size ?? 0) > 0
  }

  listSubscriberPtyIds(): string[] {
    return [...this.subscribers.keys()]
  }

  listSubscribers(ptyId: string): TerminalMobileSubscriber[] {
    return [...(this.subscribers.get(ptyId)?.values() ?? [])].map(snapshotSubscriber)
  }

  getSubscriber(ptyId: string, clientId: string): TerminalMobileSubscriber | null {
    const subscriber = this.subscribers.get(ptyId)?.get(clientId)
    return subscriber ? snapshotSubscriber(subscriber) : null
  }

  setSubscriber(ptyId: string, subscriber: TerminalMobileSubscriber): void {
    let subscribers = this.subscribers.get(ptyId)
    if (!subscribers) {
      subscribers = new Map()
      this.subscribers.set(ptyId, subscribers)
    }
    subscribers.set(subscriber.clientId, snapshotSubscriber(subscriber))
  }

  deleteSubscriber(ptyId: string, clientId: string): TerminalMobileSubscriber | null {
    const subscribers = this.subscribers.get(ptyId)
    const subscriber = subscribers?.get(clientId) ?? null
    subscribers?.delete(clientId)
    return subscriber ? snapshotSubscriber(subscriber) : null
  }

  deleteSubscribers(ptyId: string): void {
    this.subscribers.delete(ptyId)
  }

  markActor(ptyId: string, clientId: string): boolean {
    const subscriber = this.subscribers.get(ptyId)?.get(clientId)
    if (!subscriber) {
      return false
    }
    subscriber.lastActedAt = Date.now()
    return true
  }

  setViewport(ptyId: string, clientId: string, viewport: TerminalDimensions): boolean {
    const subscriber = this.subscribers.get(ptyId)?.get(clientId)
    if (!subscriber) {
      return false
    }
    subscriber.viewport = { ...viewport }
    return true
  }

  recordViewportActivity(ptyId: string, clientId: string, viewport: TerminalDimensions): boolean {
    if (!this.setViewport(ptyId, clientId, viewport)) {
      return false
    }
    return this.markActor(ptyId, clientId)
  }

  setPhoneFit(ptyId: string, clientId: string, fitted: boolean): boolean {
    const subscriber = this.subscribers.get(ptyId)?.get(clientId)
    if (!subscriber) {
      return false
    }
    subscriber.wasResizedToPhone = fitted
    return true
  }

  clearPhoneFits(ptyId: string): string[] {
    const cleared: string[] = []
    for (const subscriber of this.subscribers.get(ptyId)?.values() ?? []) {
      if (!subscriber.wasResizedToPhone) {
        continue
      }
      subscriber.wasResizedToPhone = false
      cleared.push(subscriber.clientId)
    }
    return cleared
  }

  restorePhoneFits(ptyId: string, clientIds: Iterable<string>): void {
    for (const clientId of clientIds) {
      this.setPhoneFit(ptyId, clientId, true)
    }
  }

  donateRestoreBaseline(ptyId: string, baseline: TerminalDimensions): boolean {
    const subscribers = this.subscribers.get(ptyId)
    if (!subscribers) {
      return false
    }
    let earliest: TerminalMobileSubscriber | null = null
    for (const subscriber of subscribers.values()) {
      if (subscriber.previousCols != null && subscriber.previousRows != null) {
        return false
      }
      if (!earliest || subscriber.subscribedAt < earliest.subscribedAt) {
        earliest = subscriber
      }
    }
    if (!earliest) {
      return false
    }
    earliest.previousCols = baseline.cols
    earliest.previousRows = baseline.rows
    return true
  }

  refreshRestoreBaselines(ptyId: string, dimensions: TerminalDimensions): void {
    for (const subscriber of this.subscribers.get(ptyId)?.values() ?? []) {
      if (subscriber.previousCols != null && subscriber.previousRows != null) {
        subscriber.previousCols = dimensions.cols
        subscriber.previousRows = dimensions.rows
      }
    }
  }

  beginInputFloor(
    ptyId: string,
    clientId: string,
    port: {
      getDriver(): RuntimeTerminalDriverState
      setDriver(driver: RuntimeTerminalDriverState): void
      commit(previousFloor: RuntimeTerminalDriverState, isCurrent: () => boolean): Promise<void>
    }
  ): { commit: () => Promise<void>; rollback: () => void } {
    return this.inputFloor.begin(ptyId, clientId, port)
  }

  getSoftLeaver(ptyId: string): TerminalMobileSoftLeaver | null {
    const leaver = this.softLeavers.get(ptyId)
    return leaver ? { ...leaver, record: snapshotSubscriber(leaver.record) } : null
  }

  setSoftLeaver(ptyId: string, leaver: TerminalMobileSoftLeaver): void {
    this.cancelSoftLeaver(ptyId)
    this.softLeavers.set(ptyId, {
      ...leaver,
      record: snapshotSubscriber(leaver.record)
    })
  }

  takeSoftLeaver(ptyId: string): TerminalMobileSoftLeaver | null {
    const leaver = this.softLeavers.get(ptyId) ?? null
    if (leaver) {
      clearTimeout(leaver.timer)
    }
    this.softLeavers.delete(ptyId)
    return leaver ? { ...leaver, record: snapshotSubscriber(leaver.record) } : null
  }

  cancelSoftLeaver(ptyId: string): void {
    const leaver = this.softLeavers.get(ptyId)
    if (leaver) {
      clearTimeout(leaver.timer)
    }
    this.softLeavers.delete(ptyId)
  }

  setRestoreTimer(ptyId: string, entry: TerminalMobileRestoreTimer): void {
    this.cancelRestoreTimer(ptyId)
    this.restoreTimers.set(ptyId, entry)
  }

  cancelRestoreTimer(ptyId: string): void {
    const entry = this.restoreTimers.get(ptyId)
    if (entry) {
      clearTimeout(entry.timer)
    }
    this.restoreTimers.delete(ptyId)
  }

  clearRestoreTimer(ptyId: string): void {
    this.restoreTimers.delete(ptyId)
  }

  cancelAllRestoreTimers(): void {
    for (const entry of this.restoreTimers.values()) {
      clearTimeout(entry.timer)
    }
    this.restoreTimers.clear()
  }

  cancelRestoreTimersForClient(clientId: string): void {
    for (const [ptyId, entry] of this.restoreTimers) {
      if (entry.clientId === clientId) {
        this.cancelRestoreTimer(ptyId)
      }
    }
  }

  takeSoftLeaversForClient(clientId: string): [string, TerminalMobileSoftLeaver][] {
    const matches: [string, TerminalMobileSoftLeaver][] = []
    for (const [ptyId, leaver] of this.softLeavers) {
      if (leaver.clientId !== clientId) {
        continue
      }
      clearTimeout(leaver.timer)
      this.softLeavers.delete(ptyId)
      matches.push([ptyId, { ...leaver, record: snapshotSubscriber(leaver.record) }])
    }
    return matches
  }

  disconnectClient(clientId: string): {
    ptyId: string
    subscriber: TerminalMobileSubscriber
    hasSurvivors: boolean
  }[] {
    const disconnected: {
      ptyId: string
      subscriber: TerminalMobileSubscriber
      hasSurvivors: boolean
    }[] = []
    for (const ptyId of this.subscribers.keys()) {
      const subscriber = this.deleteSubscriber(ptyId, clientId)
      if (!subscriber) {
        continue
      }
      const hasSurvivors = this.hasSubscribers(ptyId)
      if (!hasSurvivors) {
        this.subscribers.delete(ptyId)
      }
      disconnected.push({ ptyId, subscriber, hasSurvivors })
    }
    return disconnected
  }

  clearPty(ptyId: string): void {
    this.subscribers.delete(ptyId)
    this.displayModes.delete(ptyId)
    this.inputFloor.clearPty(ptyId)
    this.cancelSoftLeaver(ptyId)
    this.cancelRestoreTimer(ptyId)
  }
}
