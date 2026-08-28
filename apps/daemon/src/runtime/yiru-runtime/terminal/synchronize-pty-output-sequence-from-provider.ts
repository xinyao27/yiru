import type { TerminalChunk } from '~main/agents/provider-runtime/types'

import { RuntimeTerminalEmitTerminalAgentStatusEvents } from './emit-terminal-agent-status-events'

export abstract class RuntimeTerminalSynchronizePtyOutputSequenceFromProvider extends RuntimeTerminalEmitTerminalAgentStatusEvents {
  synchronizePtyOutputSequenceFromProvider(
    ptyId: string,
    providerSequence: { value: number; generation: 'continued' | 'reset' },
    runtimeSequenceAtSpawnStart = 0
  ): number {
    if (
      !Number.isFinite(providerSequence.value) ||
      providerSequence.value < 0 ||
      !Number.isFinite(runtimeSequenceAtSpawnStart) ||
      runtimeSequenceAtSpawnStart < 0
    ) {
      return this.getPtyOutputSequence(ptyId)
    }
    const baseline = Math.floor(providerSequence.value)
    const currentSequence = this.getPtyOutputSequence(ptyId)
    const sequenceAtSpawnStart = Math.min(currentSequence, Math.floor(runtimeSequenceAtSpawnStart))
    const postSpawnSequence = currentSequence - sequenceAtSpawnStart
    const wasInitialized = this.providerSequenceInitializedPtys.has(ptyId)
    const replacesExistingRuntimeGeneration = wasInitialized || sequenceAtSpawnStart > 0
    const providerOffset =
      providerSequence.generation === 'reset'
        ? sequenceAtSpawnStart
        : (this.providerSequenceOffsetByPtyId.get(ptyId) ?? 0)
    const providerBaseline = providerOffset + baseline

    if (providerSequence.generation === 'reset') {
      // Why: daemon respawn/cold restore starts a new absolute domain. Old
      // emulator state cannot remain authoritative over the replacement.
      if (replacesExistingRuntimeGeneration) {
        this.disposeHeadlessTerminal(ptyId)
      }
      this.providerModeTrackersByPtyId.delete(ptyId)
      if (replacesExistingRuntimeGeneration && postSpawnSequence === 0) {
        this.resetTrackedTerminalStateForProviderGeneration(ptyId)
      }
    }

    const synchronizedSequence =
      providerSequence.generation === 'reset'
        ? currentSequence
        : wasInitialized
          ? currentSequence
          : providerBaseline + postSpawnSequence
    this.ptyOutputSequenceById.set(ptyId, synchronizedSequence)
    this.providerSequenceInitializedPtys.add(ptyId)
    this.providerSequenceOffsetByPtyId.set(ptyId, providerOffset)

    const snapshotMayCoverMissingState =
      (providerSequence.generation === 'continued' && !wasInitialized) ||
      (postSpawnSequence > 0 &&
        providerSequence.generation === 'reset' &&
        replacesExistingRuntimeGeneration) ||
      (providerSequence.generation === 'continued' &&
        wasInitialized &&
        providerBaseline > currentSequence)
    if (snapshotMayCoverMissingState) {
      // Why: bytes can cross the control/stream sockets around attach. Until a
      // full renderer/provider snapshot is available, a partial model is unsafe.
      this.providerSnapshotPreferredPtys.add(ptyId)
    } else if (providerSequence.generation === 'reset') {
      this.providerSnapshotPreferredPtys.delete(ptyId)
    }

    const headless = this.terminalSessions.getEmulator(ptyId)
    if (headless && !wasInitialized && providerSequence.generation === 'continued') {
      // Why: daemon bytes can reach main just before spawn resolves. Queue the
      // baseline behind those writes so their emulator sequence is rebased too.
      headless.writeChain = headless.writeChain.then(() => {
        headless.outputSequence = synchronizedSequence
      })
    }
    return synchronizedSequence
  }

  subscribeToTerminalData(
    ptyId: string,
    listener: (
      data: string,
      meta?: {
        seq?: number
        rawLength?: number
        wireByteSeq?: bigint
        cwd?: string
      }
    ) => void
  ): () => void {
    return this.terminalSessions.subscribeToData(ptyId, (chunk, meta) => listener(chunk.text, meta))
  }

  registerTerminalMultiplexDelivery(
    ptyId: string,
    transportGeneration: string,
    listener: (
      chunk: TerminalChunk,
      meta?: {
        seq?: number
        rawLength?: number
        wireByteSeq?: bigint
        cwd?: string
      }
    ) => void
  ): (() => void) | null {
    let hub = this.terminalMultiplexDeliveryHubs.get(ptyId)
    if (hub && hub.transportGeneration !== transportGeneration) {
      return null
    }
    if (!hub) {
      const listeners = new Set<typeof listener>()
      const unsubscribe = this.terminalSessions.subscribeToData(ptyId, (chunk, meta) => {
        for (const subscriber of listeners) {
          subscriber(chunk, meta)
        }
      })
      hub = { transportGeneration, listeners, unsubscribe }
      this.terminalMultiplexDeliveryHubs.set(ptyId, hub)
    }
    hub.listeners.add(listener)
    return () => {
      const current = this.terminalMultiplexDeliveryHubs.get(ptyId)
      current?.listeners.delete(listener)
      if (current?.listeners.size === 0) {
        current.unsubscribe()
        this.terminalMultiplexDeliveryHubs.delete(ptyId)
      }
    }
  }

  reportTerminalMultiplexPressure(
    ptyId: string,
    streamKey: string,
    pressure: { participates: boolean; blocked: boolean; pendingRatio: number } | null
  ): void {
    let streams = this.terminalMultiplexPressureByPty.get(ptyId)
    if (!streams) {
      if (!pressure) {
        return
      }
      streams = new Map()
      this.terminalMultiplexPressureByPty.set(ptyId, streams)
    }
    if (pressure) {
      streams.set(streamKey, pressure)
    } else {
      streams.delete(streamKey)
    }
    if (streams.size === 0) {
      this.terminalMultiplexPressureByPty.delete(ptyId)
    }
    this.reconcileTerminalMultiplexProducerPressure(ptyId, streams)
  }

  protected reconcileTerminalMultiplexProducerPressure(
    ptyId: string,
    streams: Map<string, { participates: boolean; blocked: boolean; pendingRatio: number }>
  ): void {
    // Why: docs/reference/terminal-multiplex.md OQ-5 lets one progressing interested viewer keep
    // the producer live; only all-blocked viewers may pause the shared PTY.
    const interested = Array.from(streams.values()).filter((stream) => stream.participates)
    const isPaused = this.terminalMultiplexPausedProducers.has(ptyId)
    const shouldPause =
      interested.length > 0 &&
      interested.every((stream) => stream.blocked) &&
      interested.some((stream) => stream.pendingRatio >= 0.75)
    const shouldResume =
      isPaused &&
      (interested.length === 0 ||
        interested.some((stream) => !stream.blocked) ||
        interested.every((stream) => stream.pendingRatio <= 0.25))
    if (shouldPause && !isPaused && this.pauseTerminalProducer(ptyId)) {
      this.terminalMultiplexPausedProducers.add(ptyId)
    } else if (shouldResume) {
      this.resumeTerminalProducer(ptyId)
      this.terminalMultiplexPausedProducers.delete(ptyId)
    }
  }
}
