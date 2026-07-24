import type { AgentStatusState } from '@yiru/workbench-model/agent'
import { powerMonitor, powerSaveBlocker } from 'electron'

import { LinuxLidSleepAssertion } from './linux-lid-sleep-assertion'
import { MacosSystemSleepAssertion } from './macos-system-sleep-assertion'

export const AGENT_AWAKE_STATUS_STALE_AFTER_MS = 2 * 60 * 60 * 1000

export type AgentAwakeStatus = {
  state: AgentStatusState
  receivedAt: number
  observedInCurrentRuntime: boolean
}

type PlatformAwakeAssertion = {
  start: (reason: string) => void
  stop: (reason: string) => void
  dispose: () => void
}

export class AgentAwakeService {
  private enabled = false
  private statuses: AgentAwakeStatus[] = []
  private blockerId: number | null = null
  private staleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly linuxAssertion: PlatformAwakeAssertion
  private readonly macosAssertion: PlatformAwakeAssertion
  private readonly unsubscribeResume: () => void

  constructor() {
    // Windows lid close is intentionally not modeled as an assertion here:
    // keeping it awake requires mutating the user's global power plan.
    this.linuxAssertion = new LinuxLidSleepAssertion((reason) => this.refresh(reason))
    this.macosAssertion = new MacosSystemSleepAssertion((reason) => this.refresh(reason))
    const onResume = () => this.refresh('power-resume')
    powerMonitor.on('resume', onResume)
    this.unsubscribeResume = () => powerMonitor.off('resume', onResume)
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return
    }
    this.enabled = enabled
    this.refresh('settings-change')
  }

  setStatuses(statuses: AgentAwakeStatus[]): void {
    this.statuses = statuses.map((status) => ({ ...status }))
    this.refresh('status-change')
  }

  dispose(): void {
    this.clearStaleTimer()
    this.unsubscribeResume()
    this.stopBlocker('dispose')
    this.macosAssertion.dispose()
    this.linuxAssertion.dispose()
  }

  private refresh(reason: string): void {
    this.scheduleStaleTimer()
    const runningStatusCount = this.getEligibleRunningStatusCount()
    const shouldBlock = this.enabled && runningStatusCount > 0
    if (shouldBlock) {
      this.startBlocker(reason, runningStatusCount)
      this.startMacosAssertion(reason)
      this.startLinuxAssertion(reason)
    } else {
      this.stopBlocker(reason, runningStatusCount)
      this.stopMacosAssertion(reason)
      this.stopLinuxAssertion(reason)
    }
  }

  private getEligibleRunningStatusCount(): number {
    const now = Date.now()
    return this.statuses.filter((status) => this.isWakeEligible(status, now)).length
  }

  private isWakeEligible(status: AgentAwakeStatus, now: number): boolean {
    return (
      status.observedInCurrentRuntime &&
      status.state === 'working' &&
      Number.isFinite(status.receivedAt) &&
      now - status.receivedAt <= AGENT_AWAKE_STATUS_STALE_AFTER_MS
    )
  }

  private scheduleStaleTimer(): void {
    this.clearStaleTimer()
    const now = Date.now()
    let earliestExpiry: number | null = null
    for (const status of this.statuses) {
      if (
        !status.observedInCurrentRuntime ||
        status.state !== 'working' ||
        !Number.isFinite(status.receivedAt)
      ) {
        continue
      }
      const expiry = status.receivedAt + AGENT_AWAKE_STATUS_STALE_AFTER_MS
      if (expiry <= now) {
        continue
      }
      earliestExpiry = earliestExpiry === null ? expiry : Math.min(earliestExpiry, expiry)
    }
    if (earliestExpiry === null) {
      return
    }
    this.staleTimer = setTimeout(() => {
      this.staleTimer = null
      this.refresh('stale-expiry')
    }, earliestExpiry - now)
    if (typeof this.staleTimer.unref === 'function') {
      this.staleTimer.unref()
    }
  }

  private clearStaleTimer(): void {
    if (!this.staleTimer) {
      return
    }
    clearTimeout(this.staleTimer)
    this.staleTimer = null
  }

  private startBlocker(reason: string, runningStatusCount: number): void {
    if (this.blockerId !== null) {
      if (this.reconcileBlocker('start-reconcile')) {
        return
      }
    }
    try {
      const id = powerSaveBlocker.start('prevent-display-sleep')
      this.blockerId = id
      this.reconcileBlocker('post-start')
    } catch (err) {
      console.warn('[agent-awake] failed to start blocker', {
        reason,
        enabled: this.enabled,
        runningStatusCount,
        error: err
      })
    }
  }

  private startMacosAssertion(reason: string): void {
    try {
      this.macosAssertion.start(reason)
    } catch (err) {
      console.warn('[agent-awake] failed to start macOS system sleep assertion', {
        reason,
        enabled: this.enabled,
        error: err
      })
    }
  }

  private startLinuxAssertion(reason: string): void {
    try {
      this.linuxAssertion.start(reason)
    } catch (err) {
      console.warn('[agent-awake] failed to start Linux lid sleep assertion', {
        reason,
        enabled: this.enabled,
        error: err
      })
    }
  }

  private stopMacosAssertion(reason: string): void {
    try {
      this.macosAssertion.stop(reason)
    } catch (err) {
      console.warn('[agent-awake] failed to stop macOS system sleep assertion', {
        reason,
        enabled: this.enabled,
        error: err
      })
    }
  }

  private stopLinuxAssertion(reason: string): void {
    try {
      this.linuxAssertion.stop(reason)
    } catch (err) {
      console.warn('[agent-awake] failed to stop Linux lid sleep assertion', {
        reason,
        enabled: this.enabled,
        error: err
      })
    }
  }

  private stopBlocker(reason: string, runningStatusCount = 0): void {
    if (this.blockerId === null) {
      return
    }
    const id = this.blockerId
    try {
      powerSaveBlocker.stop(id)
    } catch (err) {
      console.warn('[agent-awake] failed to stop blocker', {
        reason,
        enabled: this.enabled,
        runningStatusCount,
        blockerId: id,
        error: err
      })
    }
    this.reconcileBlocker('post-stop')
  }

  private reconcileBlocker(reason: string): boolean {
    if (this.blockerId === null) {
      return false
    }
    const id = this.blockerId
    try {
      const isStarted = powerSaveBlocker.isStarted(id)
      if (!isStarted) {
        this.blockerId = null
      }
      return isStarted
    } catch (err) {
      console.warn('[agent-awake] failed to reconcile blocker', {
        reason,
        blockerId: id,
        error: err
      })
      return true
    }
  }
}
