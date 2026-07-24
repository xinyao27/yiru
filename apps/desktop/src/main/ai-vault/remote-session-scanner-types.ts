import type { AiVaultAgent, AiVaultSession } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { IFilesystemProvider } from '../providers/types'
import type { RemoteHostPlatform } from '../ssh/ssh-remote-platform'
import type { AntigravityWorkspaceResolver } from './session-scanner-antigravity-history'
import type { FileWithMtime } from './session-scanner-types'

export type RemoteScannerContext = {
  provider: IFilesystemProvider
  executionHostId: ExecutionHostId
  hostPlatform: RemoteHostPlatform
  titleCaches: Map<string, Promise<Map<string, string>>>
  antigravityWorkspaceResolver: AntigravityWorkspaceResolver
}

export type RemoteParserOptions = {
  executionHostId: ExecutionHostId
  executionHostPlatform: NodeJS.Platform
}

export type RemoteSessionSource = {
  agent: AiVaultAgent
  rootDir: string
  codexHome?: string
  extensions: readonly string[]
  filePredicate?: (path: string) => boolean
  // Depth 0 denotes a direct child of rootDir.
  directoryPredicate?: (name: string, depth: number) => boolean
  // A canonical file directly beneath every top-level session directory.
  fixedChildFileSegments?: readonly string[]
  // Claude layout: count `<session>/subagents/*.jsonl` siblings from the walked
  // listing and drop them from candidates instead of indexing them as sessions.
  collectSubagentSiblingCounts?: boolean
  parse: (
    file: FileWithMtime,
    content: string,
    context: RemoteScannerContext
  ) => Promise<AiVaultSession | null>
  /** Why: SSH inventory cannot inherit the ordinary 10 MiB buffered preview limit. */
  parseIncrementally?: (
    file: FileWithMtime,
    context: RemoteScannerContext,
    signal: AbortSignal
  ) => Promise<AiVaultSession | null>
}

export type RemoteSessionCandidate = {
  source: RemoteSessionSource
  file: FileWithMtime
  subagentTranscriptCount?: number
}
