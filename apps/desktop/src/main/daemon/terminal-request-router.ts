import { performance } from 'node:perf_hooks'

import { isTuiAgent } from '~shared/tui-agent/config'

import type { BackgroundTransientFactRelay } from './background-transient-facts'
import type { DaemonFileLog } from './file-log'
import type { ConnectedDaemonClient } from './server-types'
import { recordDaemonStreamBacklogEvent } from './stream-backlog-probe'
import type { DaemonStreamDataBatcher } from './stream-data-batcher'
import type { TerminalHost } from './terminal-host'
import { type DaemonRequest, SessionNotFoundError } from './types'

const INTERACTIVE_OUTPUT_WINDOW_MS = 100
const INTERACTIVE_OUTPUT_MAX_CHARS = 1024

type TerminalRequestContext = {
  clients: Map<string, ConnectedDaemonClient>
  host: TerminalHost
  log: DaemonFileLog
  streamDataBatcher: DaemonStreamDataBatcher
  transientFactRelay: BackgroundTransientFactRelay
  streamClientIdBySessionId: Map<string, string>
  lastInputAtBySessionId: Map<string, number>
  buildAgentHookPtyEnv: () => Record<string, string>
}

export type TerminalRequestRouteResult = { matched: true; value: unknown } | { matched: false }

export async function routeTerminalRequest(
  clientId: string,
  request: DaemonRequest,
  context: TerminalRequestContext
): Promise<TerminalRequestRouteResult> {
  const client = context.clients.get(clientId)
  switch (request.type) {
    case 'createOrAttach': {
      const payload = request.payload
      const result = await context.host.createOrAttach({
        sessionId: payload.sessionId,
        cols: payload.cols,
        rows: payload.rows,
        cwd: payload.cwd,
        env: { ...payload.env, ...context.buildAgentHookPtyEnv() },
        envToDelete: payload.envToDelete,
        command: payload.command,
        startupCommandDelivery: payload.startupCommandDelivery,
        ...(isTuiAgent(payload.launchAgent) ? { launchAgent: payload.launchAgent } : {}),
        shellOverride: payload.shellOverride,
        terminalWindowsWslDistro: payload.terminalWindowsWslDistro,
        terminalWindowsPowerShellImplementation: payload.terminalWindowsPowerShellImplementation,
        shellReadySupported: payload.shellReadySupported,
        historySeed: payload.historySeed,
        ...(payload.shellReadyTimeoutMs !== undefined
          ? { shellReadyTimeoutMs: payload.shellReadyTimeoutMs }
          : {}),
        streamClient: {
          onData: (data) => {
            context.transientFactRelay.onSessionData(payload.sessionId, data)
            const lastInputAt = context.lastInputAtBySessionId.get(payload.sessionId)
            const isInteractiveOutput =
              data.length <= INTERACTIVE_OUTPUT_MAX_CHARS &&
              lastInputAt !== undefined &&
              performance.now() - lastInputAt <= INTERACTIVE_OUTPUT_WINDOW_MS
            context.streamDataBatcher.enqueue(clientId, payload.sessionId, data, {
              flushImmediately: isInteractiveOutput,
              flushMaxChars: INTERACTIVE_OUTPUT_MAX_CHARS
            })
          },
          onExit: (code) => {
            context.log.log('session-exited', { sessionId: payload.sessionId, code })
            context.streamDataBatcher.enqueueControlEvent(clientId, payload.sessionId, {
              type: 'event',
              event: 'exit',
              sessionId: payload.sessionId,
              payload: { code }
            })
            context.streamDataBatcher.flush(clientId)
            recordDaemonStreamBacklogEvent('sessionExit', {
              sessionIdSuffix: payload.sessionId.slice(-10)
            })
            context.transientFactRelay.onSessionExit(payload.sessionId)
            context.streamClientIdBySessionId.delete(payload.sessionId)
            context.lastInputAtBySessionId.delete(payload.sessionId)
          }
        }
      })
      context.streamClientIdBySessionId.set(payload.sessionId, clientId)
      if (context.transientFactRelay.isBackgrounded(payload.sessionId)) {
        context.streamDataBatcher.enqueueControlEvent(clientId, payload.sessionId, {
          type: 'event',
          event: 'sessionBackgroundMarker',
          sessionId: payload.sessionId,
          payload: { background: true }
        })
      }
      context.log.log(result.isNew ? 'session-created' : 'session-attached', {
        sessionId: payload.sessionId,
        pid: result.pid
      })
      return {
        matched: true,
        value: {
          isNew: result.isNew,
          snapshot: result.snapshot,
          pid: result.pid,
          shellState: result.shellState,
          ...(result.launchAgent ? { launchAgent: result.launchAgent } : {}),
          ...(result.historySeeded !== undefined ? { historySeeded: result.historySeeded } : {})
        }
      }
    }
    case 'cancelCreateOrAttach':
      return { matched: true, value: {} }
    case 'write':
      try {
        context.lastInputAtBySessionId.set(request.payload.sessionId, performance.now())
        context.host.write(request.payload.sessionId, request.payload.data)
      } catch (error) {
        context.lastInputAtBySessionId.delete(request.payload.sessionId)
        if (error instanceof SessionNotFoundError) {
          sendExitEvent(client, request.payload.sessionId, context)
        }
        throw error
      }
      return { matched: true, value: {} }
    case 'resize':
      try {
        context.host.resize(request.payload.sessionId, request.payload.cols, request.payload.rows)
      } catch (error) {
        if (error instanceof SessionNotFoundError) {
          sendExitEvent(client, request.payload.sessionId, context)
        }
        throw error
      }
      return { matched: true, value: {} }
    case 'pausePty':
      context.host.pauseProducer(request.payload.sessionId)
      return { matched: true, value: {} }
    case 'resumePty':
      context.host.resumeProducer(request.payload.sessionId)
      return { matched: true, value: {} }
    case 'setSessionBackground':
      setSessionBackground(request.payload.sessionId, request.payload.background === true, context)
      return { matched: true, value: {} }
    case 'kill':
      context.lastInputAtBySessionId.delete(request.payload.sessionId)
      context.log.log('session-killed', {
        sessionId: request.payload.sessionId,
        immediate: request.payload.immediate === true
      })
      await context.host.kill(request.payload.sessionId, { immediate: request.payload.immediate })
      return { matched: true, value: {} }
    case 'signal':
      context.host.signal(request.payload.sessionId, request.payload.signal)
      return { matched: true, value: {} }
    case 'detach':
      context.log.log('session-detached', { sessionId: request.payload.sessionId })
      return { matched: true, value: {} }
    case 'getCwd':
      return {
        matched: true,
        value: { cwd: await context.host.getCwd(request.payload.sessionId) }
      }
    case 'getForegroundProcess':
      return {
        matched: true,
        value: { foregroundProcess: context.host.getForegroundProcess(request.payload.sessionId) }
      }
    case 'confirmForegroundProcess':
      return {
        matched: true,
        value: {
          foregroundProcess: await context.host.confirmForegroundProcess(request.payload.sessionId)
        }
      }
    case 'clearScrollback':
      context.host.clearScrollback(request.payload.sessionId)
      return { matched: true, value: {} }
    case 'listSessions':
      return { matched: true, value: { sessions: context.host.listSessions() } }
    case 'getSnapshot':
      return { matched: true, value: getSessionSnapshot(request, context.host) }
    case 'getSize':
      return {
        matched: true,
        value: { size: context.host.getAppliedSize(request.payload.sessionId) }
      }
    case 'takePendingOutput':
      return {
        matched: true,
        value: context.host.takePendingOutput(
          request.payload.sessionId,
          request.payload.includeSnapshot === true,
          { teardownSnapshot: request.payload.teardownSnapshot === true }
        )
      }
    case 'configureAgentHookHost':
    case 'getAgentHookPtyEnv':
    case 'ping':
    case 'ptySpawnHealth':
    case 'shutdown':
    case 'systemResolverHealth':
      return { matched: false }
  }
}

function setSessionBackground(
  sessionId: string,
  background: boolean,
  context: TerminalRequestContext
): void {
  recordDaemonStreamBacklogEvent('setSessionBackground', {
    sessionIdSuffix: sessionId.slice(-10),
    background
  })
  if (!context.transientFactRelay.setSessionBackground(sessionId, background)) {
    return
  }
  if (background) {
    context.transientFactRelay.seedSessionScanState(
      sessionId,
      context.host.getPartialEscapeTailAnsi(sessionId)
    )
  }
  const streamClientId = context.streamClientIdBySessionId.get(sessionId)
  if (!streamClientId) {
    return
  }
  const scanSeedAnsi = background ? '' : context.host.getPartialEscapeTailAnsi(sessionId)
  context.streamDataBatcher.enqueueControlEvent(streamClientId, sessionId, {
    type: 'event',
    event: 'sessionBackgroundMarker',
    sessionId,
    payload: { background, ...(scanSeedAnsi ? { scanSeedAnsi } : {}) }
  })
}

function getSessionSnapshot(
  request: Extract<DaemonRequest, { type: 'getSnapshot' }>,
  host: TerminalHost
): { snapshot: ReturnType<TerminalHost['getSnapshot']> } {
  const startedAt = performance.now()
  const requestedRows = request.payload.scrollbackRows
  const scrollbackRows =
    typeof requestedRows === 'number' && Number.isFinite(requestedRows)
      ? Math.max(0, Math.min(50_000, Math.floor(requestedRows)))
      : undefined
  const snapshot = host.getSnapshot(request.payload.sessionId, { scrollbackRows })
  const snapshotMs = performance.now() - startedAt
  if (snapshotMs >= 25) {
    recordDaemonStreamBacklogEvent('slowGetSnapshot', {
      sessionIdSuffix: request.payload.sessionId.slice(-10),
      snapshotMs: Math.round(snapshotMs)
    })
  }
  return { snapshot }
}

function sendExitEvent(
  client: ConnectedDaemonClient | undefined,
  sessionId: string,
  context: TerminalRequestContext
): void {
  if (!client?.streamSocket) {
    return
  }
  context.streamDataBatcher.enqueueControlEvent(client.clientId, sessionId, {
    type: 'event',
    event: 'exit',
    sessionId,
    payload: { code: -1 }
  })
  context.streamDataBatcher.flush(client.clientId)
}
