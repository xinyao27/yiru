import { randomUUID } from 'node:crypto'

import type { TerminalSideEffectBatch } from '@yiru/runtime-protocol/workbench/terminal/side-effect-facts'

import type { DriverState } from '../model/worktree-resolution'
import { RuntimeTerminalSynchronizePtyOutputSequenceFromProvider } from './synchronize-pty-output-sequence-from-provider'

export abstract class RuntimeTerminalSubscribeToTerminalSideEffects extends RuntimeTerminalSynchronizePtyOutputSequenceFromProvider {
  subscribeToTerminalSideEffects(
    ptyId: string,
    listener: (batch: TerminalSideEffectBatch, wireByteSeq: bigint) => void
  ): () => void {
    let listeners = this.terminalMultiplexSideEffectListeners.get(ptyId)
    if (!listeners) {
      listeners = new Set()
      this.terminalMultiplexSideEffectListeners.set(ptyId, listeners)
    }
    listeners.add(listener)
    this.refreshTerminalSideEffectConsumerAvailability()
    return () => {
      const current = this.terminalMultiplexSideEffectListeners.get(ptyId)
      current?.delete(listener)
      if (current?.size === 0) {
        this.terminalMultiplexSideEffectListeners.delete(ptyId)
        this.refreshTerminalSideEffectConsumerAvailability()
      }
    }
  }

  subscribeToTerminalMultiplexClear(
    ptyId: string,
    listener: (seq: bigint, correlationId: number, initiatorClientId: string) => void
  ): () => void {
    let listeners = this.terminalMultiplexClearListeners.get(ptyId)
    if (!listeners) {
      listeners = new Set()
      this.terminalMultiplexClearListeners.set(ptyId, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = this.terminalMultiplexClearListeners.get(ptyId)
      current?.delete(listener)
      if (current?.size === 0) {
        this.terminalMultiplexClearListeners.delete(ptyId)
      }
    }
  }

  subscribeToTerminalMultiplexRestore(
    ptyId: string,
    listener: (seq: bigint, reason: 'provider-gap') => void
  ): () => void {
    let listeners = this.terminalMultiplexRestoreListeners.get(ptyId)
    if (!listeners) {
      listeners = new Set()
      this.terminalMultiplexRestoreListeners.set(ptyId, listeners)
    }
    listeners.add(listener)
    return () => {
      const current = this.terminalMultiplexRestoreListeners.get(ptyId)
      current?.delete(listener)
      if (current?.size === 0) {
        this.terminalMultiplexRestoreListeners.delete(ptyId)
      }
    }
  }

  broadcastTerminalMultiplexClear(
    ptyId: string,
    seq: bigint,
    correlationId: number,
    initiatorClientId: string
  ): void {
    for (const listener of this.terminalMultiplexClearListeners.get(ptyId) ?? []) {
      listener(seq, correlationId, initiatorClientId)
    }
  }

  getTerminalWireByteSequence(ptyId: string): bigint {
    return this.ptyWireByteSequenceById.get(ptyId) ?? 0n
  }

  getTerminalTransportGeneration(ptyId: string): string {
    let generation = this.ptyTransportGenerationById.get(ptyId)
    if (!generation) {
      generation = randomUUID()
      this.ptyTransportGenerationById.set(ptyId, generation)
    }
    return generation
  }

  pauseTerminalProducer(ptyId: string): boolean {
    if (!this.ptyController?.pauseProducer) {
      return false
    }
    this.ptyController.pauseProducer(ptyId)
    return true
  }

  async attachTerminalProducer(ptyId: string): Promise<void> {
    await this.ptyController?.attach?.(ptyId)
  }

  resumeTerminalProducer(ptyId: string): void {
    this.ptyController?.resumeProducer?.(ptyId)
  }

  async sendTerminalSignal(ptyId: string, signal: string): Promise<boolean> {
    if (!this.ptyController?.sendSignal) {
      return false
    }
    try {
      await this.ptyController.sendSignal(ptyId, signal)
      return true
    } catch {
      return false
    }
  }

  async stopTerminalTransport(ptyId: string, keepHistory: boolean): Promise<boolean> {
    if (this.ptyController?.stopAndWait) {
      return this.ptyController.stopAndWait(ptyId, { keepHistory })
    }
    return this.ptyController?.kill(ptyId) ?? false
  }

  /** Set by pty IPC: fires when a PTY gains/loses remote view subscribers so
   *  the daemon background mark (keep-tail stream thinning) can resync — a
   *  live mobile/web view consumes raw bytes and must never be thinned, even
   *  while the desktop pane is hidden. */

  protected notifyRemoteTerminalViewPresenceChanged(ptyId: string): void {
    try {
      this.onRemoteTerminalViewPresenceChanged?.(ptyId)
    } catch (err) {
      console.error('[runtime] remote view presence listener threw', { ptyId, err })
    }
  }

  /** Registered by terminal-RPC subscribe/multiplex streams: while a remote
   *  view subscriber is attached its xterm answers queries with view
   *  authority and the model responder must stay silent. Returns an
   *  idempotent release. */

  registerRemoteTerminalViewSubscriber(ptyId: string): () => void {
    return this.terminalSessions.registerRemoteView(ptyId)
  }

  hasRemoteTerminalViewSubscriber(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteView(ptyId)
  }

  isMobileTerminalQueryReplyAuthority(ptyId: string, clientId: string): boolean {
    // Why: a passive phone watching desktop-sized output must not race the
    // desktop xterm. Mobile becomes reply authority only with the mobile floor.
    if (this.getDriver(ptyId).kind !== 'mobile') {
      return false
    }
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
    if (subscribers.length === 0) {
      return false
    }
    // Why: soft-leave resubscribe preserves the original subscription time but
    // reinserts the record. Elect fitted responders from that stable age, not
    // mutable Map order or passive desktop-mode watchers.
    let earliest: { clientId: string; subscribedAt: number } | null = null
    for (const subscriber of subscribers) {
      if (!subscriber.wasResizedToPhone) {
        continue
      }
      if (earliest === null || subscriber.subscribedAt < earliest.subscribedAt) {
        earliest = subscriber
      }
    }
    return earliest?.clientId === clientId
  }

  subscribeToFitOverrideChanges(
    ptyId: string,
    listener: (event: {
      mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
      cols: number
      rows: number
    }) => void
  ): () => void {
    return this.terminalSessions.subscribeToFit(ptyId, listener)
  }

  subscribeToDriverChanges(ptyId: string, listener: (driver: DriverState) => void): () => void {
    return this.terminalSessions.subscribeToDriver(ptyId, listener)
  }
}
