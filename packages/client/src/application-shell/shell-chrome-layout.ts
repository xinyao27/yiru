import type { AppState } from '../store/types'
import {
  resolveLeftTitlebarChromeLayout,
  type LeftTitlebarChromeLayout
} from './titlebar-left-chrome'

type ShellChromeLayoutInput = {
  activeView: AppState['activeView']
  creationLayoutActive: boolean
  extensionSidePanelOpen: boolean
  hasNativeSidebarMaterial: boolean
  isExtensionHost: boolean
  sidebarOpen: boolean
  workspaceChromeActive: boolean
}

type ShellChromeLayout = {
  leftTitlebarChromeLayout: LeftTitlebarChromeLayout
  navigationSidebarOpen: boolean
  settingsChromeOverlayActive: boolean
  settingsNativeSidebarMaterialActive: boolean
  showProfileSwitcherInTopRight: boolean
  showSidebar: boolean
  stackedPageOwnsTitlebar: boolean
  stackedSidebarOpen: boolean
}

export function resolveShellChromeLayout({
  activeView,
  creationLayoutActive,
  extensionSidePanelOpen,
  hasNativeSidebarMaterial,
  isExtensionHost,
  sidebarOpen,
  workspaceChromeActive
}: ShellChromeLayoutInput): ShellChromeLayout {
  const showSidebar = isExtensionHost
    ? !extensionSidePanelOpen
    : activeView !== 'settings' && activeView !== 'space'
  const navigationSidebarOpen = isExtensionHost ? showSidebar : sidebarOpen
  const stackedSidebarOpen =
    !isExtensionHost &&
    !workspaceChromeActive &&
    !creationLayoutActive &&
    showSidebar &&
    navigationSidebarOpen
  const leftTitlebarChromeLayout = isExtensionHost
    ? { shouldMount: false, isFloating: false }
    : resolveLeftTitlebarChromeLayout({
        workspaceChromeActive,
        stackedSidebarOpen,
        creationLayoutActive,
        sidebarOpen: navigationSidebarOpen
      })

  return {
    leftTitlebarChromeLayout,
    navigationSidebarOpen,
    settingsChromeOverlayActive: !isExtensionHost && activeView === 'settings',
    settingsNativeSidebarMaterialActive:
      !isExtensionHost && activeView === 'settings' && hasNativeSidebarMaterial,
    showProfileSwitcherInTopRight: !isExtensionHost && !(showSidebar && navigationSidebarOpen),
    showSidebar,
    stackedPageOwnsTitlebar: activeView === 'mobile' || activeView === 'skills',
    stackedSidebarOpen
  }
}
