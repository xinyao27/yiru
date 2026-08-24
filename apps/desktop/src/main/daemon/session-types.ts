import type { TuiAgent } from '~shared/types'

export type SubprocessHandle = {
  pid: number
  getForegroundProcess(): string | null
  confirmForegroundProcess?(): Promise<string | null>
  startupCommandDeliveredInShellArgs?: boolean
  shellPath?: string
  write(data: string): void
  resize(cols: number, rows: number): void
  pause?(): void
  resume?(): void
  clear?(): void
  kill(): void
  forceKill(): void
  signal(signal: string): void
  onData(callback: (data: string) => void): void
  onExit(callback: (code: number) => void): void
  dispose(): void
}

export type SessionOptions = {
  sessionId: string
  cols: number
  rows: number
  terminalHandle?: string
  launchAgent?: TuiAgent
  subprocess: SubprocessHandle
  shellReadySupported: boolean
  shellReadyTimeoutMs?: number
  historySeed?: string
  scrollback?: number
  onExit?: (code: number) => void
}
