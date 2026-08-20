import { release } from 'node:os'

import { createShellPlatformService, type ShellPlatformService } from '../ipc/shell'

let platformService: ShellPlatformService | null = null

export function initializeShellPlatformService(): void {
  platformService = createShellPlatformService()
}

export function getShellPlatformService(): ShellPlatformService {
  if (!platformService) {
    throw new Error('shell platform service is not initialized')
  }
  return platformService
}

export function getRenderingHost(): {
  platform: NodeJS.Platform
  osRelease: string
  displayServer: 'wayland' | 'x11' | null
} {
  return {
    platform: process.platform,
    osRelease: release(),
    displayServer:
      process.platform === 'linux'
        ? process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY
          ? 'wayland'
          : 'x11'
        : null
  }
}
