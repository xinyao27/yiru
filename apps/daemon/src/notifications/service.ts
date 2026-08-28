import type { AgentPhase } from '@yiru/runtime-protocol/contract'

import type { WorkspaceEventLog } from '../events/log'
import { translate } from '../i18n/translate'
import type { MobileDeviceStore } from '../mobile/devices'
import type { DaemonDatabase } from '../store/database'
import type { AgentPhaseChange } from './agent-phase'
import { MobileNotificationChannel } from './channel'
import { NativeNotificationService } from './native'
import { RemoteNotificationService } from './remote'

export class NotificationService {
  readonly channel: MobileNotificationChannel
  private readonly native: NativeNotificationService
  private readonly remote: RemoteNotificationService

  constructor(options: {
    devices: MobileDeviceStore
    database: DaemonDatabase
    events: WorkspaceEventLog
    hasChromeClient: () => boolean
    isMobileDeviceConnected: (deviceId: string) => boolean
    gatewayEndpoint?: string
    gatewayToken?: string
  }) {
    this.channel = new MobileNotificationChannel(options.database)
    this.native = new NativeNotificationService(options.events, options.hasChromeClient)
    this.remote = new RemoteNotificationService({
      devices: options.devices,
      endpoint: options.gatewayEndpoint,
      events: options.events,
      isDeviceConnected: options.isMobileDeviceConnected,
      token: options.gatewayToken
    })
  }

  publishAgentPhase(input: AgentPhaseChange): void {
    if (!isNotificationPhase(input.phase)) {
      return
    }
    this.native.publish(input)
    this.remote.enqueue(input)
    this.channel.dispatch({
      body: input.title || translate('Open Yiru to review the agent session'),
      notificationId: input.terminal,
      source: 'agent-task-complete',
      title:
        input.phase === 'waiting-decision'
          ? translate('Yiru needs your decision')
          : translate('Yiru agent completed'),
      type: 'notification',
      worktreeId: input.worktreeId
    })
  }

  async drain(): Promise<void> {
    await this.remote.drain()
  }
}

function isNotificationPhase(phase: AgentPhase): boolean {
  return phase === 'waiting-decision' || phase === 'complete'
}
