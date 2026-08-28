import type { TuiAgent } from '@yiru/runtime-protocol/model/agent'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

export type PtySpawnOptions = {
  cols: number
  rows: number
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  hostId?: ExecutionHostId
  command?: string
  commandDelivery?: 'renderer' | 'provider'
  startupCommandDelivery?: 'fast' | 'shell-ready'
  launchAgent?: TuiAgent
  worktreeId?: string
  paneKey?: string
  tabId?: string
  sessionId?: string
  isNewSession?: boolean
  shellOverride?: string
  terminalWindowsWslDistro?: string | null
  terminalWindowsPowerShellImplementation?: 'auto' | 'powershell.exe' | 'pwsh.exe'
}

export type PtySpawnResult = {
  id: string
  pid?: number | null
  launchAgent?: TuiAgent
  snapshot?: string
  snapshotCols?: number
  snapshotRows?: number
  providerSequence?: {
    value: number
    generation: 'continued' | 'reset'
  }
  snapshotKittyKeyboardFlags?: number
  isReattach?: boolean
  isAlternateScreen?: boolean
  replay?: string
  sessionExpired?: boolean
  coldRestore?: {
    scrollback: string
    cwd: string
  }
}

export type PtyProcessInfo = {
  id: string
  cwd: string
  title: string
  worktreeId?: string
  terminalHandle?: string
}
