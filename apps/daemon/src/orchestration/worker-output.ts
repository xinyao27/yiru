import type {
  AgentProviderSessionMetadata,
  AgentType,
  AgentTranscriptMessage
} from '@yiru/runtime-protocol/model/agent'
import type {
  RuntimeTerminalRead,
  RuntimeTerminalState
} from '@yiru/runtime-protocol/workbench/runtime-types'

export const ORCHESTRATION_WORKER_READ_SOURCES = ['auto', 'transcript', 'terminal'] as const
export type OrchestrationWorkerReadSource = (typeof ORCHESTRATION_WORKER_READ_SOURCES)[number]

export const ORCHESTRATION_WORKER_READ_FALLBACK_REASONS = [
  'provider_unsupported',
  'session_not_reported',
  'transcript_missing',
  'transcript_unreadable',
  'transcript_parse_failed',
  'remote_capability_unavailable'
] as const
export type OrchestrationWorkerReadFallbackReason =
  (typeof ORCHESTRATION_WORKER_READ_FALLBACK_REASONS)[number]

export type ExactWorkerProviderSession = {
  paneKey: string
  processIncarnation: string
  agent: AgentType
  providerSession: AgentProviderSessionMetadata
  observedAt: number
}

export type OrchestrationWorkerTranscriptPage = {
  messages: AgentTranscriptMessage[]
  nextCursor: string
  limited: boolean
  returnedMessageCount: number
}

export type OrchestrationWorkerReadTranscriptResult = {
  dispatchId: string
  source: 'transcript'
  sourceIdentity: string
  provider: AgentType
  transcript: OrchestrationWorkerTranscriptPage
  cursor: string
  status: {
    worker: string
    terminal: RuntimeTerminalState
  }
  fallbackReason: null
  warnings: string[]
}

export type OrchestrationWorkerReadTerminalResult = {
  dispatchId: string
  source: 'terminal'
  sourceIdentity: string
  terminal: RuntimeTerminalRead
  cursor: string | null
  status: {
    worker: string
    terminal: RuntimeTerminalState
  }
  fallbackReason: OrchestrationWorkerReadFallbackReason | null
  warnings: string[]
}

export type OrchestrationWorkerReadResult =
  | OrchestrationWorkerReadTranscriptResult
  | OrchestrationWorkerReadTerminalResult
