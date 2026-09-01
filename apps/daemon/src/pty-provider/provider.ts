import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { TerminalChunk } from '~main/agents/provider-runtime/types'

import type { HostRegistry } from '../hosts/registry'
import { BunTerminalBuffer } from './buffer'
import type { PtyProcessInfo, PtySpawnOptions, PtySpawnResult } from './contract'
import { BunTerminalInputWriter } from './input-writer'
import { sessionCwd, sessionForeground, sessionHasChildren } from './session-process'
import {
  type BunPtyManagedSession,
  projectManagedSessions,
  projectProcesses
} from './session-projection'
import {
  listLocalShellProfiles,
  resolvePtyEnvironment,
  resolveRemotePtyEnvironment,
  resolvePtyShell,
  resolvePtySignal
} from './spawn-command'

type PtyData = { id: string; chunk: TerminalChunk; sequenceChars?: number }
type PtyExit = { id: string; code: number }
type PtyReplay = { id: string; data: string }

const EMPTY_TERMINAL_BYTES = new Uint8Array()

type BunPtySession = {
  cols: number
  createdAt: number
  cwd: string
  id: string
  hostId: ExecutionHostId
  input: BunTerminalInputWriter
  launchAgent: PtySpawnOptions['launchAgent']
  output: BunTerminalBuffer
  outputDecoder: TextDecoder
  process: ReturnType<typeof Bun.spawn>
  rows: number
  shell: string
  terminal: Bun.Terminal
  terminalHandle?: string
  worktreeId?: string
}

export type BunPtyProviderOptions = {
  environment?: Record<string, string>
  hosts: HostRegistry
  onLifecycleEvent?: (event: BunPtyLifecycleEvent) => void
}

export type BunPtyLifecycleEvent =
  | {
      kind: 'terminal.created'
      sessionId: string
      worktreeId: string | null
    }
  | {
      exitCode: number
      kind: 'terminal.exited'
      sessionId: string
      worktreeId: string | null
    }

export class BunPtyProvider {
  readonly protocolVersion = 24
  private readonly dataListeners = new Set<(payload: PtyData) => void>()
  private environment: Record<string, string>
  private readonly exitListeners = new Set<(payload: PtyExit) => void>()
  private readonly hosts: HostRegistry
  private readonly onLifecycleEvent: ((event: BunPtyLifecycleEvent) => void) | undefined
  private readonly replayListeners = new Set<(payload: PtyReplay) => void>()
  private readonly sessions = new Map<string, BunPtySession>()

  constructor(options: BunPtyProviderOptions) {
    this.environment = options.environment ?? {}
    this.hosts = options.hosts
    this.onLifecycleEvent = options.onLifecycleEvent
  }

  configureEnvironment(environment: Record<string, string>): void {
    this.environment = { ...environment }
  }

  async spawn(options: PtySpawnOptions): Promise<PtySpawnResult> {
    const id = options.sessionId?.trim() || crypto.randomUUID()
    const existing = this.sessions.get(id)
    if (existing) {
      const snapshot = await existing.output.snapshot()
      return {
        id,
        pid: existing.process.pid,
        launchAgent: existing.launchAgent,
        isReattach: true,
        snapshot: snapshot.data,
        snapshotCols: snapshot.cols,
        snapshotRows: snapshot.rows,
        isAlternateScreen: snapshot.alternateScreen,
        providerSequence: { value: snapshot.seq, generation: 'continued' }
      }
    }

    const host = this.hosts.get(options.hostId)
    const shell = resolvePtyShell(options.shellOverride)
    const output = new BunTerminalBuffer(options.cols, options.rows)
    const outputDecoder = new TextDecoder()
    let input: BunTerminalInputWriter | null = null
    const terminal = new Bun.Terminal({
      cols: options.cols,
      rows: options.rows,
      name: 'xterm-256color',
      data: (_terminal, bytes) => {
        this.acceptOutput(id, output, {
          text: outputDecoder.decode(bytes, { stream: true }),
          bytes
        })
      },
      drain: () => input?.drain()
    })
    input = new BunTerminalInputWriter(terminal)
    const cwd = options.cwd || process.cwd()
    const launch = host.ptyLaunch({
      command: options.command,
      cwd,
      env:
        host.kind === 'local'
          ? resolvePtyEnvironment(this.environment, options)
          : resolveRemotePtyEnvironment(this.environment, options),
      shell: options.shellOverride
    })
    let child: ReturnType<typeof Bun.spawn>
    try {
      child = Bun.spawn(launch.argv, {
        ...(launch.cwd ? { cwd: launch.cwd } : {}),
        env: launch.env,
        terminal
      })
    } catch (error) {
      terminal.close()
      await output.dispose()
      throw error
    }
    const session: BunPtySession = {
      cols: options.cols,
      createdAt: Date.now(),
      cwd,
      hostId: host.id,
      input,
      id,
      launchAgent: options.launchAgent,
      output,
      outputDecoder,
      process: child,
      rows: options.rows,
      shell,
      terminal,
      ...(options.env?.YIRU_TERMINAL_HANDLE
        ? { terminalHandle: options.env.YIRU_TERMINAL_HANDLE }
        : {}),
      ...(options.worktreeId ? { worktreeId: options.worktreeId } : {})
    }
    this.sessions.set(id, session)
    this.onLifecycleEvent?.({
      kind: 'terminal.created',
      sessionId: id,
      worktreeId: session.worktreeId ?? null
    })
    void child.exited.then((code) => this.finishSession(id, child, code))
    return { id, pid: child.pid, launchAgent: options.launchAgent }
  }

  async attach(id: string): Promise<void> {
    this.requireSession(id)
  }

  hasPty(id: string): boolean {
    return this.sessions.has(id)
  }

  write(id: string, data: string): void {
    this.requireSession(id).input.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.requireSession(id)
    session.terminal.resize(cols, rows)
    session.output.resize(cols, rows)
    session.cols = cols
    session.rows = rows
  }

  async getAppliedSize(id: string): Promise<{ cols: number; rows: number } | null> {
    const session = this.sessions.get(id)
    return session ? { cols: session.cols, rows: session.rows } : null
  }

  async shutdown(id: string, options: { immediate?: boolean }): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }
    session.process.kill(options.immediate ? 9 : 15)
    await session.process.exited
  }

  async shutdownAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.shutdown(id, { immediate: true })))
  }

  async sendSignal(id: string, signal: string): Promise<void> {
    this.requireSession(id).process.kill(resolvePtySignal(signal))
  }

  async getCwd(id: string): Promise<string> {
    return sessionCwd(this.sessions.get(id))
  }

  async getInitialCwd(id: string): Promise<string> {
    return this.sessions.get(id)?.cwd ?? ''
  }

  async clearBuffer(id: string): Promise<void> {
    await this.requireSession(id).output.clear()
  }

  acknowledgeDataEvent(_id: string, _charCount: number): void {}

  async hasChildProcesses(id: string): Promise<boolean> {
    return sessionHasChildren(this.sessions.get(id))
  }

  async getForegroundProcess(id: string): Promise<string | null> {
    return sessionForeground(this.sessions.get(id))
  }

  async serialize(_ids: string[]): Promise<string> {
    return '{}'
  }

  async revive(_state: string): Promise<void> {}

  async listProcesses(): Promise<PtyProcessInfo[]> {
    return projectProcesses([...this.sessions.values()])
  }

  async listManagedSessions(): Promise<BunPtyManagedSession[]> {
    return projectManagedSessions([...this.sessions.values()])
  }

  async listSessions(): Promise<BunPtyManagedSession[]> {
    return this.listManagedSessions()
  }

  async getDefaultShell(): Promise<string> {
    return resolvePtyShell()
  }

  async getProfiles(): Promise<{ name: string; path: string }[]> {
    return listLocalShellProfiles()
  }

  canProvideAuthoritativeBufferSnapshot(id: string): boolean {
    return this.sessions.has(id)
  }

  async getBufferSnapshot(id: string, options: { scrollbackRows?: number } = {}) {
    const session = this.sessions.get(id)
    if (!session) {
      return null
    }
    const snapshot = await session.output.snapshot(options.scrollbackRows)
    return { ...snapshot, cwd: session.cwd }
  }

  onData(callback: (payload: PtyData) => void): () => void {
    this.dataListeners.add(callback)
    return () => this.dataListeners.delete(callback)
  }

  onReplay(callback: (payload: PtyReplay) => void): () => void {
    this.replayListeners.add(callback)
    return () => this.replayListeners.delete(callback)
  }

  onExit(callback: (payload: PtyExit) => void): () => void {
    this.exitListeners.add(callback)
    return () => this.exitListeners.delete(callback)
  }

  private emitData(payload: PtyData): void {
    for (const listener of this.dataListeners) {
      listener(payload)
    }
  }

  private acceptOutput(id: string, output: BunTerminalBuffer, chunk: TerminalChunk): void {
    if (!chunk.text && chunk.bytes.byteLength === 0) {
      return
    }
    if (chunk.text) {
      output.write(chunk.text)
    }
    this.emitData({ id, chunk, sequenceChars: chunk.text.length })
  }

  private async finishSession(
    id: string,
    child: ReturnType<typeof Bun.spawn>,
    code: number
  ): Promise<void> {
    const session = this.sessions.get(id)
    if (!session || session.process !== child) {
      return
    }
    this.acceptOutput(id, session.output, {
      text: session.outputDecoder.decode(),
      bytes: EMPTY_TERMINAL_BYTES
    })
    await session.output.dispose()
    this.sessions.delete(id)
    session.input.clear()
    session.terminal.close()
    this.onLifecycleEvent?.({
      exitCode: code,
      kind: 'terminal.exited',
      sessionId: id,
      worktreeId: session.worktreeId ?? null
    })
    for (const listener of this.exitListeners) {
      listener({ id, code })
    }
  }

  private requireSession(id: string): BunPtySession {
    const session = this.sessions.get(id)
    if (!session) {
      throw new Error(`Unknown PTY session: ${id}`)
    }
    return session
  }
}
