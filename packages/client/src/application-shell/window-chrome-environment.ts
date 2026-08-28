import { supportsNativeSidebarMaterial } from '../native-sidebar-material-support'
import { getRenderingHostSnapshot } from '../runtime/shell-platform-client'
import { getRendererAppPlatform } from '../settings/renderer-app-platform'
import { isPairedWebClientWindow, shouldRenderDesktopWindowChrome } from './window-chrome'

export const appPlatform = getRendererAppPlatform()
export const isMacApp = appPlatform === 'darwin'
export const isPairedWebClient = isPairedWebClientWindow()
export const hasCustomTitleBar = shouldRenderDesktopWindowChrome({
  platform: appPlatform,
  isWebClient: isPairedWebClient
})

const rendererOsRelease = typeof window === 'undefined' ? '' : getRenderingHostSnapshot().osRelease

export const hasNativeSidebarMaterial =
  !isPairedWebClient && supportsNativeSidebarMaterial(appPlatform, rendererOsRelease ?? '')
