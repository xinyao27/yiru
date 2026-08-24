import { readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, normalize } from 'node:path'

import type { NotificationSettings, NotificationSoundDataResult } from '~shared/types'

import beepSoundPath from '../../../resources/notification-sounds/beep.mp3?asset'
import blipSoundPath from '../../../resources/notification-sounds/blip.mp3?asset'
import blopSoundPath from '../../../resources/notification-sounds/blop.mp3?asset'
import bongSoundPath from '../../../resources/notification-sounds/bong.mp3?asset'
import clackSoundPath from '../../../resources/notification-sounds/clack.mp3?asset'
import dingSoundPath from '../../../resources/notification-sounds/ding.mp3?asset'
import sonarSoundPath from '../../../resources/notification-sounds/sonar.mp3?asset'
import thumpSoundPath from '../../../resources/notification-sounds/thump.mp3?asset'
import twoToneSoundPath from '../../../resources/notification-sounds/two-tone.mp3?asset'
import { getEffectiveNotificationSoundId } from './notification-options'

const MAX_NOTIFICATION_SOUND_BYTES = 10 * 1024 * 1024
const NOTIFICATION_SOUND_MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.ogg', 'audio/ogg'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac']
])
const BUILT_IN_NOTIFICATION_SOUNDS: ReadonlyMap<string, string> = new Map([
  ['two-tone', twoToneSoundPath],
  ['bong', bongSoundPath],
  ['thump', thumpSoundPath],
  ['blip', blipSoundPath],
  ['sonar', sonarSoundPath],
  ['blop', blopSoundPath],
  ['ding', dingSoundPath],
  ['clack', clackSoundPath],
  ['beep', beepSoundPath]
])

function getSelectedNotificationSoundPath(settings: NotificationSettings): {
  path: string | null
  reason?: 'missing-path' | 'invalid-path' | 'unsupported-type'
} {
  const soundId = getEffectiveNotificationSoundId(settings)
  if (soundId === 'system') {
    return { path: null, reason: 'missing-path' }
  }
  if (soundId !== 'custom') {
    const builtInPath = BUILT_IN_NOTIFICATION_SOUNDS.get(soundId)
    return builtInPath ? { path: builtInPath } : { path: null, reason: 'missing-path' }
  }
  if (!settings.customSoundPath) {
    return { path: null, reason: 'missing-path' }
  }
  const normalizedPath = normalize(settings.customSoundPath)
  if (!isAbsolute(normalizedPath)) {
    return { path: null, reason: 'invalid-path' }
  }
  if (!NOTIFICATION_SOUND_MIME_BY_EXTENSION.has(extname(normalizedPath).toLowerCase())) {
    return { path: null, reason: 'unsupported-type' }
  }
  return { path: normalizedPath }
}

export async function loadNotificationSound(
  settings: NotificationSettings
): Promise<NotificationSoundDataResult> {
  const selectedSound = getSelectedNotificationSoundPath(settings)
  if (!selectedSound.path) {
    return { ok: false, reason: selectedSound.reason ?? 'missing-path' }
  }
  const normalizedPath = normalize(selectedSound.path)
  const mimeType = NOTIFICATION_SOUND_MIME_BY_EXTENSION.get(extname(normalizedPath).toLowerCase())
  if (!mimeType) {
    return { ok: false, reason: 'unsupported-type' }
  }
  try {
    const fileStat = await stat(normalizedPath)
    if (!fileStat.isFile()) {
      return { ok: false, reason: 'invalid-path' }
    }
    if (fileStat.size > MAX_NOTIFICATION_SOUND_BYTES) {
      return { ok: false, reason: 'too-large' }
    }
    const data = await readFile(normalizedPath)
    return { ok: true, data: new Uint8Array(data), mimeType, path: normalizedPath }
  } catch {
    return { ok: false, reason: 'read-failed' }
  }
}
