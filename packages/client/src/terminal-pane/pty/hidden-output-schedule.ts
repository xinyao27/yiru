import type { Terminal } from '@xterm/xterm'

import {
  cancelScheduledHiddenOutputRestore,
  scheduleHiddenOutputRestore
} from '../hidden-output-restore-scheduler'

type HiddenOutputScheduleOptions = {
  terminal: Terminal
  getIsDisposed: () => boolean
  getGeneration: () => number
  getRestorePtyId: () => string | null
  getPtyId: () => string | null
  canUseSnapshot: (ptyId: string | null) => ptyId is string
  hasWork: () => boolean
  getIsForeground: () => boolean
  run: () => void
}

export type HiddenOutputSchedule = {
  deferInactive: (ptyId: string) => void
  clear: () => void
}

export function createHiddenOutputSchedule(
  options: HiddenOutputScheduleOptions
): HiddenOutputSchedule {
  let isScheduled = false
  const clear = (): void => {
    cancelScheduledHiddenOutputRestore(options.terminal)
    isScheduled = false
  }
  return {
    deferInactive: (ptyId) => {
      if (isScheduled) {
        return
      }
      isScheduled = true
      const generation = options.getGeneration()
      scheduleHiddenOutputRestore(
        options.terminal,
        () => {
          isScheduled = false
          if (
            !options.getIsDisposed() &&
            options.getGeneration() === generation &&
            options.getRestorePtyId() === ptyId &&
            options.getPtyId() === ptyId &&
            options.canUseSnapshot(ptyId) &&
            options.hasWork() &&
            options.getIsForeground()
          ) {
            options.run()
          }
        },
        'inactive'
      )
    },
    clear
  }
}
