import type * as pty from 'node-pty'

import type { PtyProcessInfo, PtySpawnOptions, PtySpawnResult } from '../types'
import type { LocalPtyProviderOptions } from './model'
import type { LocalPtyEnvironmentContext, LocalPtyShellContext } from './spawn-context'
import type { DataCallback, ExitCallback, PtyShutdownOperation } from './state'

export abstract class LocalPtyProviderContract {
  protected opts: LocalPtyProviderOptions

  constructor(opts: LocalPtyProviderOptions = {}) {
    this.opts = opts
  }

  configure(opts: LocalPtyProviderOptions): void {
    this.opts = opts
  }

  protected abstract resolveLocalPtyShell(args: PtySpawnOptions, id: string): LocalPtyShellContext
  protected abstract prepareLocalPtyEnvironment(
    context: LocalPtyShellContext
  ): LocalPtyEnvironmentContext
  protected abstract spawnLocalPtyProcess(context: LocalPtyEnvironmentContext): PtySpawnResult

  abstract spawn(args: PtySpawnOptions): Promise<PtySpawnResult>

  abstract attach(_id: string): Promise<void>

  abstract hasPty(id: string): boolean

  abstract write(id: string, data: string): void

  abstract resize(id: string, cols: number, rows: number): void

  abstract pauseProducer(id: string): void

  abstract resumeProducer(id: string): void

  abstract getAppliedSize(id: string): Promise<{ cols: number; rows: number } | null>

  abstract shutdown(id: string, opts: { immediate?: boolean; keepHistory?: boolean }): Promise<void>

  protected abstract shutdownTrackedPty(
    id: string,
    proc: pty.IPty,
    operation: PtyShutdownOperation
  ): Promise<void>

  protected abstract requestTrackedPtyShutdown(id: string, proc: pty.IPty, immediate: boolean): void

  abstract sendSignal(id: string, signal: string): Promise<void>

  abstract getCwd(id: string): Promise<string>

  abstract getInitialCwd(_id: string): Promise<string>

  abstract clearBuffer(id: string): Promise<void>

  abstract acknowledgeDataEvent(_id: string, _charCount: number): void

  abstract hasChildProcesses(id: string): Promise<boolean>

  abstract getForegroundProcess(id: string): Promise<string | null>

  abstract confirmForegroundProcess(id: string): Promise<string | null>

  abstract serialize(_ids: string[]): Promise<string>

  abstract revive(_state: string): Promise<void>

  abstract listProcesses(): Promise<PtyProcessInfo[]>

  abstract getDefaultShell(): Promise<string>

  abstract getProfiles(): Promise<{ name: string; path: string }[]>

  abstract onData(callback: DataCallback): () => void

  abstract onReplay(_callback: (payload: { id: string; data: string }) => void): () => void

  abstract onExit(callback: ExitCallback): () => void

  abstract killOrphanedPtys(currentGeneration: number): { id: string }[]

  abstract advanceGeneration(): number

  abstract getPtyProcess(id: string): pty.IPty | undefined

  abstract killAll(): void
}
