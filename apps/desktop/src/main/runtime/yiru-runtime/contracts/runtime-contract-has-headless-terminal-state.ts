import type { TerminalOscLinkRange } from '@yiru/runtime-protocol/terminal-osc-links'
import type { TerminalQueryReplyOwner } from '~main/runtime/terminal-model-query-authority'
import type { RuntimeTerminalRead } from '~shared/runtime-types'
import type { TerminalViewAttributes } from '~shared/terminal/view-attributes'

import type { ProviderTerminalBufferSnapshot } from '../model/mobile-worktree-summary'
import type { HeadlessSeedMetadata, RuntimeHeadlessTerminal } from '../model/terminal-observation'
import { RuntimeContractExtractLastOsc7CwdForPty } from './runtime-contract-extract-last-osc7-cwd-for-pty'

export abstract class RuntimeContractHasHeadlessTerminalState extends RuntimeContractExtractLastOsc7CwdForPty {
  abstract hasHeadlessTerminalState(ptyId: string): boolean

  abstract serializeMainTerminalBuffer(
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
  } | null>

  abstract serializeTerminalMultiplexBuffer(
    ptyId: string,
    scrollbackRows: number
  ): Promise<{
    data: string
    scrollbackAnsi?: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    pendingEscapeTailAnsi?: string
    wireByteSeq: bigint
    retainedScrollbackRows: number
    kittyKeyboardFlags: number
  } | null>

  abstract serializeHiddenOutputRecoveryBuffer(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    wireByteSeq?: bigint
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    pendingEscapeTailAnsi?: string
    retainedScrollbackRows?: number
    kittyKeyboardFlags?: number
  } | null>

  abstract clearTerminalBuffer(handle: string): Promise<{ handle: string; cleared: boolean }>

  abstract getTerminalSize(ptyId: string): { cols: number; rows: number } | null

  abstract isTerminalAlternateScreen(ptyId: string): boolean

  abstract seedHeadlessTerminal(
    ptyId: string,
    data: string,
    size?: { cols: number; rows: number },
    metadata?: HeadlessSeedMetadata
  ): void

  abstract getTerminalQueryReplyOwnerForLiveChunk(ptyId: string): TerminalQueryReplyOwner

  abstract updateTerminalViewAttributes(attributes: TerminalViewAttributes): void

  protected abstract trackHeadlessTerminalData(
    ptyId: string,
    data: string,
    outputSequence: number,
    wireByteSequence: bigint,
    forwardQueryReplies?: boolean
  ): void

  protected abstract createPtyHeadlessTerminalState(
    ptyId: string,
    dims: { cols: number; rows: number }
  ): RuntimeHeadlessTerminal

  protected abstract ensureNativeWindowsConptyDa1Override(ptyId: string): void

  protected abstract getOrCreateHeadlessTerminal(ptyId: string): RuntimeHeadlessTerminal

  protected abstract resizeHeadlessTerminal(ptyId: string, cols: number, rows: number): void

  abstract clearHeadlessTerminalBuffer(ptyId: string): Promise<void>

  protected abstract serializeTerminalBufferFromAvailableState(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    source?: 'headless' | 'provider'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    pendingEscapeTailAnsi?: string
  } | null>

  protected abstract serializeProviderTerminalBuffer(
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<ProviderTerminalBufferSnapshot | null>

  protected abstract withVisibleSnapshotFallback(
    ptyId: string,
    read: RuntimeTerminalRead,
    opts?: { cursor?: number; limit?: number }
  ): Promise<RuntimeTerminalRead>

  protected abstract readVisibleSnapshotLines(ptyId: string): Promise<string[]>

  protected abstract serializeHeadlessTerminalBuffer(
    ptyId: string,
    opts?: { scrollbackRows?: number; includeEmpty?: boolean }
  ): Promise<{
    data: string
    cols: number
    rows: number
    cwd?: string | null
    lastTitle?: string
    seq?: number
    wireByteSeq?: bigint
    source?: 'headless'
    oscLinks?: TerminalOscLinkRange[]
    alternateScreen?: boolean
    scrollbackAnsi?: string
    retainedScrollbackRows?: number
    kittyKeyboardFlags?: number
    // Why: dangling mid-escape tail the restorer must write LAST, after any
    // reset, so the next live chunk completes it instead of rendering it
    // literally (Bug E / #7329).
    pendingEscapeTailAnsi?: string
  } | null>

  protected abstract disposeHeadlessTerminal(ptyId: string): void

  protected abstract resolveLocalRuntimeTerminalPtyId(ptyId: string): string

  abstract resolveLeafForHandle(handle: string): { ptyId: string | null } | null

  abstract resolveLiveLeafForHandle(handle: string): { ptyId: string | null } | null

  abstract resolveTerminalCwd(handle: string): Promise<string | null>

  abstract resolveTerminalFileUriHostname(handle: string): string | null
}
