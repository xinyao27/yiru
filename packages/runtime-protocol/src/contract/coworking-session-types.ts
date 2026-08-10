import type { CoworkingAgentLaunchId } from './coworking-input.js'
import type { RuntimeCoworkingErrorCode } from './coworking-types.js'

export type RuntimeCoworkingLiveSession = {
  terminalRef: string
  title: string
  isActive: boolean
  provider: 'claude' | 'codex' | 'other'
  providerSessionId: string | null
  sessionKind: 'terminal' | 'agent'
  agent: CoworkingAgentLaunchId | null
  sessionKey: string | null
}

export type RuntimeCoworkingHistoricalSession = {
  sessionRef: string
  title: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  cwd: string | null
  transcriptPath: string
  resumeCommand: string
}

export type RuntimeCoworkingLiveSessionsResponse =
  | { status: 'ok'; result: { sessions: RuntimeCoworkingLiveSession[] } }
  | { status: 'error'; code: RuntimeCoworkingErrorCode }

export type RuntimeCoworkingHistoricalSessionPageResponse =
  | {
      status: 'ok'
      result: {
        sessions: RuntimeCoworkingHistoricalSession[]
        nextCursor: string | null
        scannedAt: string
      }
    }
  | { status: 'error'; code: RuntimeCoworkingErrorCode }

export type RuntimeCoworkingSessionInvokeResponse =
  | { status: 'ok'; result: { terminalHandle: string } }
  | { status: 'error'; code: RuntimeCoworkingErrorCode }

export type RuntimeCoworkingObservedProviderSession = {
  provider: 'claude' | 'codex'
  providerSessionId: string
  sessionKey: string | null
}

export type RuntimeCoworkingSessionChangedEvent = {
  kind: 'changed'
  providerSessions: RuntimeCoworkingObservedProviderSession[]
}
