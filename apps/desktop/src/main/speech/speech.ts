import { systemPreferences } from 'electron'

export async function ensureShellMicrophoneAccess(): Promise<void> {
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
