import { acquireWatcherRemovalGate } from '~main/filesystem/watcher-removal-gate'
import { NotificationCooldownTracker } from '~main/notifications/notification-cooldown-tracker'
import { RuntimeAccounts } from '~main/runtime/accounts/capabilities'
import { MobileNotificationChannel } from '~main/runtime/mobile-notification-channel'
import { RuntimeEmulatorCommands } from '~main/runtime/yiru-runtime-emulator'
import { RuntimeGitCommands } from '~main/runtime/yiru-runtime-git'
import type { GlobalSettings } from '~shared/types'

import { RuntimeStateCallOrchestrationWorkerServer } from './runtime-state-call-orchestration-worker-server'

export abstract class RuntimeStateAcquireFileWatcherRemoval extends RuntimeStateCallOrchestrationWorkerServer {
  acquireFileWatcherRemoval = async (
    worktreePath: string
  ): Promise<{ finish(removed: boolean): Promise<void> }> => {
    const gate = acquireWatcherRemovalGate(worktreePath)
    try {
      // Why: the first pass aborts desktop setup immediately; the second catches
      // any pre-gate runtime install that published after the first snapshot.
      await this.closeFileWatchersForRemoval(worktreePath)
      await gate.ready
      await this.closeFileWatchersForRemoval(worktreePath)
      let finished = false
      return {
        finish: async (removed) => {
          if (finished) {
            return
          }
          finished = true
          if (removed) {
            this.forgetFileWatchersAfterRemoval(worktreePath)
          }
          gate.release()
          if (!removed) {
            await this.restoreFileWatchersAfterFailedRemoval(worktreePath).catch(
              (restoreError: unknown) => {
                console.error('[worktrees] failed to restore watchers after removal failed', {
                  worktreePath,
                  restoreError
                })
              }
            )
          }
        }
      }
    } catch (error) {
      gate.release()
      await this.restoreFileWatchersAfterFailedRemoval(worktreePath).catch(
        (restoreError: unknown) => {
          console.error('[worktrees] failed to restore watchers after removal setup failed', {
            worktreePath,
            restoreError
          })
        }
      )
      throw error
    }
  }

  readonly gitCommands = new RuntimeGitCommands({
    resolveRuntimeGitTarget: (selector) => this.resolveRuntimeGitTarget(selector),
    getRuntimeSettings: () => this.requireStore().getSettings() as GlobalSettings,
    getCommitMessageAgentEnvironment: () => this.commitMessageAgentEnv ?? undefined
  })

  protected preferTrackedLastTitle<T extends { lastTitle?: string }>(
    ptyId: string,
    snapshot: T
  ): T {
    const tracked = this.getTrackedRawTitleForPty(ptyId)
    if (!tracked) {
      return snapshot
    }
    return { ...snapshot, lastTitle: tracked }
  }

  /** Decorative comparison key: spinner frame glyphs stripped, derived agent
   *  status kept so a working→idle flip with an otherwise-equal label still
   *  counts as a change. */

  onRemoteTerminalViewPresenceChanged: ((ptyId: string) => void) | null = null

  readonly mobileNotifications = new MobileNotificationChannel()

  readonly accounts = new RuntimeAccounts()

  readonly desktopNotificationCooldown = new NotificationCooldownTracker()

  readonly mobileNotificationCooldown = new NotificationCooldownTracker()

  readonly emulatorCommands = new RuntimeEmulatorCommands({
    emitEmulatorEvent: (event) => this.emitEmulatorEvent(event),
    getEmulatorBridge: () => this.emulatorBridge,
    resolveWorktreeSelector: (selector) => this.resolveWorktreeSelector(selector),
    getSettings: () => this.requireStore().getSettings()
  })
}
