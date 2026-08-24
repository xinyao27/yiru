import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { ParsedAgentStatusPayload } from '@yiru/workbench-model/agent'
import type { ProcessedAgentStatusChunk } from '~shared/agent/status-osc'
import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type { DriverState } from '../model/worktree-resolution'
import { RuntimeContractPersistHeadlessTerminalTitle } from './runtime-contract-persist-headless-terminal-title'

export abstract class RuntimeContractExtractLastOsc7CwdForPty extends RuntimeContractPersistHeadlessTerminalTitle {
  protected abstract extractLastOsc7CwdForPty(
    ptyId: string,
    data: string
  ): { path: string; hostname: string } | null

  protected abstract recordOsc7MetadataForPty(
    ptyId: string,
    data: string
  ): { cwd: string | null; cwdChanged: boolean }

  protected abstract pathFlavorForPty(pty?: RuntimePtyWorktreeRecord | null): 'posix' | 'win32'

  protected abstract emitTerminalAgentStatusEvents(
    ptyId: string,
    chunk: ProcessedAgentStatusChunk
  ): boolean

  protected abstract retainAgentRowSnapshot(
    ptyId: string,
    paneKey: string,
    worktreeId: string | undefined,
    tabId: string | undefined,
    payload: ParsedAgentStatusPayload
  ): boolean

  protected abstract clearAgentRowSnapshotsForPty(ptyId: string): void

  abstract getPtyOutputSequence(ptyId: string): number

  abstract synchronizePtyOutputSequenceFromProvider(
    ptyId: string,
    providerSequence: { value: number; generation: 'continued' | 'reset' },
    runtimeSequenceAtSpawnStart?: number
  ): number

  abstract subscribeToTerminalData(
    ptyId: string,
    listener: (
      data: string,
      meta?: {
        seq?: number
        rawLength?: number
        wireByteSeq?: bigint
        wireByteLength?: number
        cwd?: string
      }
    ) => void
  ): () => void

  abstract registerTerminalMultiplexDelivery(
    ptyId: string,
    transportGeneration: string,
    listener: (
      data: string,
      meta?: {
        seq?: number
        rawLength?: number
        wireByteSeq?: bigint
        wireByteLength?: number
        cwd?: string
      }
    ) => void
  ): (() => void) | null

  abstract reportTerminalMultiplexPressure(
    ptyId: string,
    streamKey: string,
    pressure: { participates: boolean; blocked: boolean; pendingRatio: number } | null
  ): void

  protected abstract reconcileTerminalMultiplexProducerPressure(
    ptyId: string,
    streams: Map<string, { participates: boolean; blocked: boolean; pendingRatio: number }>
  ): void

  abstract subscribeToTerminalSideEffects(
    ptyId: string,
    listener: (batch: TerminalSideEffectBatch, wireByteSeq: bigint) => void
  ): () => void

  abstract subscribeToTerminalMultiplexClear(
    ptyId: string,
    listener: (seq: bigint, correlationId: number, initiatorClientId: string) => void
  ): () => void

  abstract subscribeToTerminalMultiplexRestore(
    ptyId: string,
    listener: (seq: bigint, reason: 'provider-gap') => void
  ): () => void

  abstract broadcastTerminalMultiplexClear(
    ptyId: string,
    seq: bigint,
    correlationId: number,
    initiatorClientId: string
  ): void

  abstract getTerminalWireByteSequence(ptyId: string): bigint

  abstract getTerminalTransportGeneration(ptyId: string): string

  abstract pauseTerminalProducer(ptyId: string): boolean

  abstract attachTerminalProducer(ptyId: string): Promise<void>

  abstract resumeTerminalProducer(ptyId: string): void

  abstract sendTerminalSignal(ptyId: string, signal: string): Promise<boolean>

  abstract stopTerminalTransport(ptyId: string, keepHistory: boolean): Promise<boolean>

  protected abstract notifyRemoteTerminalViewPresenceChanged(ptyId: string): void

  abstract registerRemoteTerminalViewSubscriber(ptyId: string): () => void

  abstract hasRemoteTerminalViewSubscriber(ptyId: string): boolean

  abstract isMobileTerminalQueryReplyAuthority(ptyId: string, clientId: string): boolean

  abstract subscribeToFitOverrideChanges(
    ptyId: string,
    listener: (event: {
      mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
      cols: number
      rows: number
    }) => void
  ): () => void

  abstract subscribeToDriverChanges(
    ptyId: string,
    listener: (driver: DriverState) => void
  ): () => void

  protected abstract notifyFitOverrideListeners(
    ptyId: string,
    mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit',
    cols: number,
    rows: number
  ): void

  abstract serializeTerminalBuffer(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<{
    data: string
    cols: number
    rows: number
    seq?: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
  } | null>
}
