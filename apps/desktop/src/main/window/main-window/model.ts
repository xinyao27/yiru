import type { KeybindingOverrides } from '~shared/keybindings'

export type CreateMainWindowOptions = {
  getIsQuitting?: () => boolean
  onQuitAborted?: () => void
  onRendererProcessGone?: (
    details: Electron.RenderProcessGoneDetails,
    webContentsId: number
  ) => void
  shouldRecoverRenderer?: (
    details: Electron.RenderProcessGoneDetails,
    webContentsId: number
  ) => boolean
  onRendererRecoveryExhausted?: (info: {
    details: Electron.RenderProcessGoneDetails
    webContentsId: number
    recentRecoveryCount: number
  }) => void
  deferLoad?: boolean
  title?: string
  getKeybindings?: () => KeybindingOverrides | undefined
  onBeforeReload?: (options: { ignoreCache: boolean; webContentsId: number }) => void
  onBeforeRecoveryReload?: (webContentsId: number) => void
}
