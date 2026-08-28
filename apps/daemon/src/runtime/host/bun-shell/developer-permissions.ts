import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState,
  DeveloperPermissionStatus
} from '@yiru/runtime-protocol/workbench/developer-permissions-types'
import {
  getComputerUsePermissionStatus,
  openComputerUsePermissions
} from '~main/computer/macos-computer-use-permissions'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

const DEVELOPER_PERMISSION_IDS: DeveloperPermissionId[] = [
  'microphone',
  'camera',
  'screen',
  'accessibility',
  'full-disk-access',
  'automation',
  'local-network',
  'usb',
  'bluetooth'
]

const PRIVACY_PANE_URLS: Partial<Record<DeveloperPermissionId, string>> = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
  bluetooth: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  'full-disk-access': 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
}

export function createBunShellDeveloperPermissionHandlers() {
  return {
    developerPermissions: {
      getStatus: runtimeImplementation.shell.developerPermissions.getStatus.handler(() =>
        getDeveloperPermissionStatus()
      ),
      request: runtimeImplementation.shell.developerPermissions.request.handler(({ input }) =>
        requestDeveloperPermission(input.id)
      )
    }
  }
}

async function getDeveloperPermissionStatus(): Promise<DeveloperPermissionState[]> {
  if (process.platform !== 'darwin') {
    return DEVELOPER_PERMISSION_IDS.map((id) => ({ id, status: 'unsupported' }))
  }

  const [computerUse, fullDiskAccess] = await Promise.all([
    getComputerUsePermissionStatus().catch(() => null),
    getFullDiskAccessStatus()
  ])
  const accessibility = computerUse?.permissions.find(
    (permission) => permission.id === 'accessibility'
  )?.status
  const screenshots = computerUse?.permissions.find(
    (permission) => permission.id === 'screenshots'
  )?.status

  return DEVELOPER_PERMISSION_IDS.map((id) => ({
    id,
    status: getPermissionStatus(id, { accessibility, fullDiskAccess, screenshots })
  }))
}

function getPermissionStatus(
  id: DeveloperPermissionId,
  status: {
    accessibility: 'granted' | 'not-granted' | 'unsupported' | undefined
    fullDiskAccess: DeveloperPermissionStatus
    screenshots: 'granted' | 'not-granted' | 'unsupported' | undefined
  }
): DeveloperPermissionStatus {
  switch (id) {
    case 'accessibility':
      return status.accessibility === 'granted' ? 'granted' : 'unknown'
    case 'screen':
      return status.screenshots === 'granted' ? 'granted' : 'unknown'
    case 'full-disk-access':
      return status.fullDiskAccess
    case 'usb':
    case 'bluetooth':
      return 'ready'
    case 'microphone':
    case 'camera':
    case 'automation':
    case 'local-network':
      return 'unknown'
  }
}

async function requestDeveloperPermission(
  id: DeveloperPermissionId
): Promise<DeveloperPermissionRequestResult> {
  if (process.platform !== 'darwin') {
    return { id, openedSystemSettings: false, status: 'unsupported' }
  }
  if (id === 'accessibility' || id === 'screen') {
    const helperPermission = id === 'accessibility' ? 'accessibility' : 'screenshots'
    const result = await openComputerUsePermissions(helperPermission)
    const permission = result.permissions?.find((item) => item.id === helperPermission)
    return {
      id,
      openedSystemSettings: result.openedSettings,
      status: permission?.status === 'granted' ? 'granted' : 'unknown'
    }
  }

  await openPrivacyPane(id)
  const states = await getDeveloperPermissionStatus()
  return {
    id,
    openedSystemSettings: true,
    status: states.find((state) => state.id === id)?.status ?? 'unknown'
  }
}

async function getFullDiskAccessStatus(): Promise<DeveloperPermissionStatus> {
  try {
    // Why: this is a daemon capability, so probe a protected file through the daemon identity.
    await access(join(homedir(), 'Library', 'Safari', 'Bookmarks.plist'))
    return 'granted'
  } catch {
    return 'unknown'
  }
}

async function openPrivacyPane(id: DeveloperPermissionId): Promise<void> {
  const url =
    PRIVACY_PANE_URLS[id] ??
    'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension'
  const process = Bun.spawn(['/usr/bin/open', url], {
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore'
  })
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error('developer_permission_settings_open_failed')
  }
}
