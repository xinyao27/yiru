import type { AgentHookRelayEnvelope } from '~shared/agent/hook-relay'

import { RelayAgentHookServer } from '../../relay/agent-hook-server'

export type DaemonAgentHookHostOptions = {
  endpointDir: string
  env: string
  forward: (envelope: AgentHookRelayEnvelope) => void
}

export type GetAgentHookPtyEnvRequest = {
  id: string
  type: 'getAgentHookPtyEnv'
}

export type DaemonAgentHookHostConfig = {
  endpointDir: string
  env: string
}

export type DaemonAgentHookHostStatus = {
  endpointFilePath: string
  port: number
}

export type ConfigureAgentHookHostRequest = {
  id: string
  type: 'configureAgentHookHost'
  payload: { config: DaemonAgentHookHostConfig | null }
}

export class DaemonAgentHookHost {
  private readonly server: RelayAgentHookServer

  constructor(options: DaemonAgentHookHostOptions) {
    this.server = new RelayAgentHookServer({
      endpointDir: options.endpointDir,
      env: options.env,
      forward: options.forward
    })
  }

  async start(): Promise<void> {
    await this.server.start()
    if (!this.server.buildPtyEnv().YIRU_AGENT_HOOK_ENDPOINT) {
      this.server.stop()
      throw new Error('The daemon agent hook endpoint file could not be published')
    }
  }

  stop(): void {
    this.server.stop()
  }

  buildPtyEnv(): Record<string, string> {
    return this.server.buildPtyEnv()
  }

  getStatus(): DaemonAgentHookHostStatus {
    const { endpointFilePath, port } = this.server.getCoordinates()
    return { endpointFilePath, port }
  }

  replayCachedPayloads(): number {
    return this.server.replayCachedPayloadsForPanes()
  }
}
