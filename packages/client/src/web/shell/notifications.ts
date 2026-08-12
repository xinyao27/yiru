import type { ShellNotificationsApi } from '../../runtime/shell-notifications-client'

export function createWebShellNotificationsApi(): ShellNotificationsApi {
  return {
    displayNative: () => Promise.resolve({ delivered: false, reason: 'not-supported' }),
    dismissNative: () => Promise.resolve({ dismissed: 0 }),
    openSystemSettings: () => Promise.resolve(),
    getPermissionStatus: () =>
      Promise.resolve({ supported: false, platform: getBrowserPlatform(), requested: false }),
    probeDelivery: () => Promise.resolve({ state: 'unsupported', authoritative: false }),
    playSound: () => Promise.resolve({ played: false, reason: 'missing-path' })
  }
}

function getBrowserPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}
