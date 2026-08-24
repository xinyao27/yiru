import type { AgentHookRelayEnvelope } from '~shared/agent/hook-relay'

import {
  DaemonAgentHookHost,
  type DaemonAgentHookHostConfig,
  type DaemonAgentHookHostStatus
} from './agent-hook-host'
import type { DaemonFileLog } from './file-log'
import { encodeNdjson } from './ndjson'
import type { ConnectedDaemonClient, DaemonServerOptions } from './server-types'

export class DaemonServerAgentHooks {
  private host: DaemonAgentHookHost | null
  private config: DaemonAgentHookHostConfig | null
  private readonly isRequired: boolean
  private readonly onAgentHook: ((envelope: AgentHookRelayEnvelope) => void) | null
  private readonly clients: Map<string, ConnectedDaemonClient>
  private readonly log: DaemonFileLog
  private configuration = Promise.resolve()

  constructor(
    options: Pick<DaemonServerOptions, 'agentHookHost' | 'isAgentHookHostRequired' | 'onAgentHook'>,
    clients: Map<string, ConnectedDaemonClient>,
    log: DaemonFileLog
  ) {
    this.clients = clients
    this.log = log
    this.config = options.agentHookHost ?? null
    this.isRequired = options.isAgentHookHostRequired === true
    this.onAgentHook = options.onAgentHook ?? null
    this.host = options.agentHookHost
      ? new DaemonAgentHookHost({
          ...options.agentHookHost,
          forward: (envelope) => this.broadcast(envelope)
        })
      : null
  }

  async start(): Promise<void> {
    if (this.isRequired && !this.host) {
      throw new Error('The required daemon agent hook host was not configured')
    }
    if (!this.host) {
      return
    }
    try {
      await this.host.start()
    } catch (error) {
      this.log.log('agent-hook-host-start-failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.host = null
      this.config = null
      if (this.isRequired) {
        throw error
      }
    }
  }

  stop(): void {
    this.host?.stop()
  }

  getStatus(): DaemonAgentHookHostStatus | null {
    return this.host?.getStatus() ?? null
  }

  buildPtyEnv(): Record<string, string> {
    return this.host?.buildPtyEnv() ?? {}
  }

  replayCachedPayloads(): void {
    this.host?.replayCachedPayloads()
  }

  configure(config: DaemonAgentHookHostConfig | null): Promise<Record<string, string>> {
    const configure = () => this.applyConfiguration(config)
    const result = this.configuration.then(configure, configure)
    this.configuration = result.then(
      () => {},
      () => {}
    )
    return result
  }

  private async applyConfiguration(
    config: DaemonAgentHookHostConfig | null
  ): Promise<Record<string, string>> {
    if (
      config &&
      this.host &&
      this.config?.endpointDir === config.endpointDir &&
      this.config.env === config.env
    ) {
      this.host.replayCachedPayloads()
      return this.host.buildPtyEnv()
    }
    this.host?.stop()
    this.host = null
    this.config = null
    if (!config) {
      return {}
    }
    const host = new DaemonAgentHookHost({
      ...config,
      forward: (envelope) => this.broadcast(envelope)
    })
    try {
      await host.start()
      this.host = host
      this.config = config
      host.replayCachedPayloads()
      return host.buildPtyEnv()
    } catch (error) {
      host.stop()
      this.log.log('agent-hook-host-configure-failed', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  private broadcast(envelope: AgentHookRelayEnvelope): void {
    const event = encodeNdjson({ type: 'event', event: 'agentHook', payload: envelope })
    for (const client of this.clients.values()) {
      client.streamSocket?.write(event)
    }
    try {
      this.onAgentHook?.(envelope)
    } catch (error) {
      this.log.log('agent-hook-host-ingest-failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
