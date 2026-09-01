import type { WorkspacePortProbe } from '@yiru/runtime-protocol/workbench/workspace/ports'

export type RawListeningPort = {
  host: string
  port: number
  pid?: number
  processName?: string
  commandLine?: string
  cwd?: string
}

export type ProcessMetadata = {
  processName?: string
  commandLine?: string
  cwd?: string
}

export type NormalizedWorkspacePortProbe = {
  worktree: WorkspacePortProbe
  normalizedPath: string
}
