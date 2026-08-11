import { BrowserWindow, powerMonitor } from 'electron'

import { publishShellEvent } from './shell/events'

type ResumeEventSource = {
  on(event: 'resume', listener: () => void): unknown
  off(event: 'resume', listener: () => void): unknown
}

type ResumeBroadcastWindow = {
  isDestroyed(): boolean
  webContents: { id: number }
}

type SystemResumeBroadcastOptions = {
  resumeSource?: ResumeEventSource
  getWindows?: () => ResumeBroadcastWindow[]
}

// Why: renderers cannot observe OS sleep/wake directly, and Linux has no
// window-occlusion tracking so visibilitychange never fires around suspend.
// Wake-sensitive renderer recovery needs this explicit resume signal.
export function registerSystemResumeBroadcast(
  options: SystemResumeBroadcastOptions = {}
): () => void {
  const resumeSource = options.resumeSource ?? powerMonitor
  const getWindows = options.getWindows ?? (() => BrowserWindow.getAllWindows())
  const onResume = (): void => {
    for (const window of getWindows()) {
      if (!window.isDestroyed()) {
        publishShellEvent(window.webContents.id, { type: 'uiSystemResumed' })
      }
    }
  }
  resumeSource.on('resume', onResume)
  return () => {
    resumeSource.off('resume', onResume)
  }
}
