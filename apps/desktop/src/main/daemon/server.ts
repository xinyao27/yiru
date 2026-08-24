import { randomUUID } from 'node:crypto'
import { chmodSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'

import { extractHiddenStartupRendererQueryData } from '~shared/terminal/reply-query-extraction'

import { readCurrentProcessMacSystemResolverHealth } from '../network/macos-system-resolver-health'
import {
  BackgroundTransientFactRelay,
  BACKGROUND_STREAM_DROP_ENABLED
} from './background-transient-facts'
import { createNoopDaemonFileLog, type DaemonFileLog } from './file-log'
import { encodeNdjson } from './ndjson'
import { checkPtySpawnHealth } from './pty-subprocess'
import { DaemonServerAgentHooks } from './server-agent-hooks'
import { acceptDaemonConnection } from './server-connections'
import type { ConnectedDaemonClient, DaemonServerOptions } from './server-types'
import { startDaemonStreamBacklogProbe } from './stream-backlog-probe'
import { DaemonStreamDataBatcher } from './stream-data-batcher'
import { TerminalHost } from './terminal-host'
import { routeTerminalRequest } from './terminal-request-router'
import { NOTIFY_PREFIX, type DaemonRequest } from './types'

export type { DaemonServerOptions } from './server-types'

export class DaemonServer {
  private server: Server | null = null
  private readonly token = randomUUID()
  private readonly socketPath: string
  private readonly tokenPath: string
  private readonly host: TerminalHost
  private readonly log: DaemonFileLog
  private readonly clients = new Map<string, ConnectedDaemonClient>()
  private readonly streamDataBatcher: DaemonStreamDataBatcher
  private readonly transientFactRelay: BackgroundTransientFactRelay
  private readonly streamClientIdBySessionId = new Map<string, string>()
  private readonly lastInputAtBySessionId = new Map<string, number>()
  private readonly agentHooks: DaemonServerAgentHooks
  private readonly onShutdownRequested: (() => void) | null
  private readonly ptySpawnHealthCheck: () => Promise<void> = checkPtySpawnHealth
  private readonly stopStreamBacklogProbe: () => void

  constructor(options: DaemonServerOptions) {
    this.socketPath = options.socketPath
    this.tokenPath = options.tokenPath
    this.log = options.log ?? createNoopDaemonFileLog()
    this.host = new TerminalHost({ spawnSubprocess: options.spawnSubprocess })
    this.onShutdownRequested = options.onShutdownRequested ?? null
    this.streamDataBatcher = new DaemonStreamDataBatcher((clientId) => this.clients.get(clientId), {
      isSessionDroppable: (sessionId) =>
        BACKGROUND_STREAM_DROP_ENABLED && this.transientFactRelay.isBackgrounded(sessionId),
      salvageDroppedData: (dropped) => {
        if (!dropped.includes('\x1b')) {
          return ''
        }
        const extracted = extractHiddenStartupRendererQueryData(dropped, '')
        return (
          extracted.statelessQueryData + extracted.statefulQueryData + extracted.oscColorQueryData
        )
      }
    })
    this.transientFactRelay = new BackgroundTransientFactRelay((sessionId, fact) => {
      const clientId = this.streamClientIdBySessionId.get(sessionId)
      if (clientId) {
        this.streamDataBatcher.enqueueControlEvent(clientId, sessionId, {
          type: 'event',
          event: 'transientFact',
          sessionId,
          payload: fact
        })
      }
    })
    this.agentHooks = new DaemonServerAgentHooks(options, this.clients, this.log)
    this.stopStreamBacklogProbe = startDaemonStreamBacklogProbe(() => ({
      clients: Array.from(this.clients.values(), (client) => ({
        clientId: client.clientId,
        socketBufferedBytes: client.streamSocket?.writableLength ?? 0,
        batcherQueuedChars: this.streamDataBatcher.queuedCharsForClient(client.clientId)
      })),
      backgroundedSessionIdSuffixes: this.transientFactRelay.backgroundedSessionIdSuffixes()
    }))
  }

  async start(): Promise<void> {
    await this.agentHooks.start()
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket))
      const onListenError = (error: Error): void => reject(error)
      this.server.once('error', onListenError)
      this.server.listen(this.socketPath, () => {
        this.server?.off('error', onListenError)
        try {
          writeFileSync(this.tokenPath, this.token, { mode: 0o600 })
        } catch (error) {
          reject(error)
          return
        }
        try {
          chmodSync(this.socketPath, 0o600)
        } catch {
          // Best effort on platforms that support socket permissions.
        }
        resolve()
      })
    })
  }

  async shutdown(): Promise<void> {
    this.agentHooks.stop()
    this.stopStreamBacklogProbe()
    this.transientFactRelay.dispose()
    try {
      await this.host.dispose()
    } catch (error) {
      this.log.log('shutdown-dispose-failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
    this.streamDataBatcher.clear()
    for (const client of this.clients.values()) {
      client.controlSocket.destroy()
      client.streamSocket?.destroy()
    }
    this.clients.clear()
    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        this.removeSocketFiles()
        resolve()
      })
      this.server = null
    })
  }

  getAgentHookHostStatus(): ReturnType<DaemonServerAgentHooks['getStatus']> {
    return this.agentHooks.getStatus()
  }

  private handleConnection(socket: Socket): void {
    acceptDaemonConnection(socket, {
      token: this.token,
      clients: this.clients,
      log: this.log,
      streamDataBatcher: this.streamDataBatcher,
      onControlRequest: (controlSocket, clientId, request) => {
        void this.handleRequest(controlSocket, clientId, request)
      }
    })
  }

  private async handleRequest(
    socket: Socket,
    clientId: string,
    request: DaemonRequest
  ): Promise<void> {
    const isNotify = request.id.startsWith(NOTIFY_PREFIX)
    try {
      const result = await this.routeRequest(clientId, request)
      if (!isNotify) {
        socket.write(encodeNdjson({ id: request.id, ok: true, payload: result }))
      }
    } catch (error) {
      if (!isNotify) {
        socket.write(
          encodeNdjson({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        )
      }
    }
  }

  private async routeRequest(clientId: string, request: DaemonRequest): Promise<unknown> {
    const terminalRoute = await routeTerminalRequest(clientId, request, {
      clients: this.clients,
      host: this.host,
      log: this.log,
      streamDataBatcher: this.streamDataBatcher,
      transientFactRelay: this.transientFactRelay,
      streamClientIdBySessionId: this.streamClientIdBySessionId,
      lastInputAtBySessionId: this.lastInputAtBySessionId,
      buildAgentHookPtyEnv: () => this.agentHooks.buildPtyEnv()
    })
    if (terminalRoute.matched) {
      return terminalRoute.value
    }
    switch (request.type) {
      case 'ping':
        return { pong: true }
      case 'systemResolverHealth':
        return { health: await readCurrentProcessMacSystemResolverHealth() }
      case 'ptySpawnHealth':
        await this.ptySpawnHealthCheck()
        return { healthy: true }
      case 'getAgentHookPtyEnv':
        this.agentHooks.replayCachedPayloads()
        return { env: this.agentHooks.buildPtyEnv() }
      case 'configureAgentHookHost':
        return { env: await this.agentHooks.configure(request.payload.config) }
      case 'shutdown':
        await this.requestShutdown(request.payload.killSessions === true)
        return {}
      case 'cancelCreateOrAttach':
      case 'clearScrollback':
      case 'confirmForegroundProcess':
      case 'createOrAttach':
      case 'detach':
      case 'getCwd':
      case 'getForegroundProcess':
      case 'getSize':
      case 'getSnapshot':
      case 'kill':
      case 'listSessions':
      case 'pausePty':
      case 'resize':
      case 'resumePty':
      case 'setSessionBackground':
      case 'signal':
      case 'takePendingOutput':
      case 'write':
        throw new Error(`Terminal request escaped terminal router: ${request.type}`)
    }
  }

  private async requestShutdown(killSessions: boolean): Promise<void> {
    this.log.log('shutdown', { reason: 'rpc', killSessions })
    if (killSessions) {
      try {
        await this.host.dispose()
      } catch (error) {
        this.log.log('shutdown-dispose-failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    process.nextTick(() => {
      if (this.onShutdownRequested) {
        this.onShutdownRequested()
      } else {
        void this.shutdown()
      }
    })
  }

  private removeSocketFiles(): void {
    try {
      unlinkSync(this.socketPath)
    } catch {}
    try {
      unlinkSync(this.tokenPath)
    } catch {}
  }
}
