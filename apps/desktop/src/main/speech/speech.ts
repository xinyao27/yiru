import { ipcMain, systemPreferences } from 'electron'

async function ensureMicrophoneAccess(): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }
  const current = systemPreferences.getMediaAccessStatus('microphone')
  if (current === 'granted') {
    return
  }
  await systemPreferences.askForMediaAccess('microphone')
  if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
    throw new Error('microphone_access_not_granted')
  }
}

// Why: capture permission belongs to the Electron shell. The dictation worker
// and audio stream are selected-runtime capabilities carried by oRPC.
export function registerSpeechHandlers(): void {
  ipcMain.removeHandler('speech:ensureMicrophoneAccess')
  ipcMain.handle('speech:ensureMicrophoneAccess', ensureMicrophoneAccess)
}
