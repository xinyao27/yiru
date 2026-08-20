import type {
  ShellServicesNotificationsDismissOutput,
  ShellServicesNotificationsDisplayInput,
  ShellServicesNotificationsDisplayOutput
} from '@yiru/runtime-protocol/contract'
import type {
  NotificationDeliveryProbeResult,
  NotificationPermissionStatusResult,
  NotificationSoundDataResult,
  NotificationSoundResult
} from '~shared/types'

import { callShellOrpc } from './orpc-client'

export type ShellNotificationsApi = {
  displayNative: (
    args: ShellServicesNotificationsDisplayInput
  ) => Promise<ShellServicesNotificationsDisplayOutput>
  dismissNative: (notificationIds: string[]) => Promise<ShellServicesNotificationsDismissOutput>
  openSystemSettings: () => Promise<void>
  getPermissionStatus: () => Promise<NotificationPermissionStatusResult>
  probeDelivery: (args?: { force?: boolean }) => Promise<NotificationDeliveryProbeResult>
  playSound: (options?: { force?: boolean; volume?: number }) => Promise<NotificationSoundResult>
}

let cachedSound: { path: string; blobUrl: string; audio: HTMLAudioElement } | null = null
let isSoundPlaying = false
let cleanupPlayback: (() => void) | null = null

function restoreShellDocument<T>(value: unknown): T {
  // Why: runtime-protocol cannot import desktop-only shared document types;
  // main validates them before this adapter restores their concrete type.
  return value as T
}

function clearPlaybackState(): void {
  cleanupPlayback?.()
  cleanupPlayback = null
  isSoundPlaying = false
}

function disposeCachedSound(): void {
  if (!cachedSound) {
    return
  }
  clearPlaybackState()
  cachedSound.audio.pause()
  cachedSound.audio.src = ''
  URL.revokeObjectURL(cachedSound.blobUrl)
  cachedSound = null
}

async function playSound(options?: {
  force?: boolean
  volume?: number
}): Promise<NotificationSoundResult> {
  try {
    if (!options?.force && isSoundPlaying) {
      return { played: false, reason: 'deduped' }
    }
    const sound = restoreShellDocument<NotificationSoundDataResult>(
      await callShellOrpc((client) => client.shell.notifications.playSound, options)
    )
    if (!sound.ok) {
      disposeCachedSound()
      return { played: false, reason: sound.reason }
    }

    let entry = cachedSound
    if (!entry || entry.path !== sound.path) {
      const arrayBuffer = new ArrayBuffer(sound.data.byteLength)
      new Uint8Array(arrayBuffer).set(sound.data)
      const blob = new Blob([arrayBuffer], { type: sound.mimeType })
      disposeCachedSound()
      const blobUrl = URL.createObjectURL(blob)
      entry = { path: sound.path, blobUrl, audio: new Audio(blobUrl) }
      cachedSound = entry
    }

    const audio = entry.audio
    audio.currentTime = 0
    if (typeof options?.volume === 'number' && Number.isFinite(options.volume)) {
      audio.volume = Math.min(1, Math.max(0, options.volume / 100))
    }
    isSoundPlaying = true
    cleanupPlayback?.()
    const cleanup = (): void => {
      audio.removeEventListener('ended', release)
      audio.removeEventListener('error', release)
    }
    const release = (): void => {
      cleanup()
      if (cleanupPlayback === cleanup) {
        cleanupPlayback = null
      }
      isSoundPlaying = false
    }
    cleanupPlayback = cleanup
    audio.addEventListener('ended', release)
    audio.addEventListener('error', release)
    try {
      await audio.play()
    } catch {
      release()
      return { played: false, reason: 'playback-failed' }
    }
    return { played: true }
  } catch {
    clearPlaybackState()
    return { played: false, reason: 'playback-failed' }
  }
}

export const electronShellNotificationsApi: ShellNotificationsApi = {
  displayNative: async (input) =>
    restoreShellDocument<ShellServicesNotificationsDisplayOutput>(
      await callShellOrpc((client) => client.shell.notifications.displayNative, input)
    ),
  dismissNative: async (notificationIds) =>
    restoreShellDocument<ShellServicesNotificationsDismissOutput>(
      await callShellOrpc((client) => client.shell.notifications.dismissNative, {
        notificationIds
      })
    ),
  openSystemSettings: () =>
    callShellOrpc((client) => client.shell.notifications.openSystemSettings, undefined),
  getPermissionStatus: async () =>
    restoreShellDocument<NotificationPermissionStatusResult>(
      await callShellOrpc((client) => client.shell.notifications.getPermissionStatus, undefined)
    ),
  probeDelivery: async (input) =>
    restoreShellDocument<NotificationDeliveryProbeResult>(
      await callShellOrpc((client) => client.shell.notifications.probeDelivery, input)
    ),
  playSound
}
