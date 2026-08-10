import type { RuntimeHostPlatformName } from '../status.js'
import type { RuntimeJsonValue } from './json-value.js'

export type RuntimeComputerErrorCode =
  | 'app_not_found'
  | 'app_blocked'
  | 'window_not_found'
  | 'window_not_focused'
  | 'window_stale'
  | 'provider_incompatible'
  | 'unsupported_capability'
  | 'permission_denied'
  | 'element_not_found'
  | 'element_not_clickable'
  | 'action_not_supported'
  | 'value_not_settable'
  | 'invalid_argument'
  | 'action_timeout'
  | 'screenshot_failed'
  | 'accessibility_error'

export type RuntimeComputerAppInfo = {
  name: string
  bundleId: string | null
  pid: number
}

export type RuntimeComputerWindowInfo = {
  id?: number | null
  index?: number | null
  title: string
  x?: number | null
  y?: number | null
  width: number
  height: number
  isMinimized?: boolean | null
  isOffscreen?: boolean | null
  screenIndex?: number | null
  platform?: Record<string, RuntimeJsonValue>
}

export type RuntimeComputerSnapshotData = {
  id: string
  app: RuntimeComputerAppInfo
  window: RuntimeComputerWindowInfo
  coordinateSpace: 'window'
  treeText: string
  elementCount: number
  focusedElementId: number | null
  truncation?: {
    truncated: boolean
    maxNodes?: number
    maxDepth?: number
    maxDepthReached?: boolean
  }
}

export type RuntimeComputerScreenshotData = {
  data?: string
  format: 'png'
  width: number
  height: number
  scale: number
  path?: string
  dataOmitted?: boolean
  expiresAt?: string
}

export type RuntimeComputerScreenshotMetadata = {
  engine?: 'screenCaptureKit' | 'cgWindowList' | 'unknown'
  windowId?: number | null
}

export type RuntimeComputerScreenshotStatus =
  | { state: 'captured'; metadata?: RuntimeComputerScreenshotMetadata }
  | { state: 'skipped'; reason: 'no_screenshot_flag' }
  | {
      state: 'failed'
      code: RuntimeComputerErrorCode
      message: string
      metadata?: RuntimeComputerScreenshotMetadata
    }

export type RuntimeComputerActionVerification =
  | {
      state: 'verified'
      property: 'focusedText' | 'selection' | 'value'
      expected?: string | null
      actualPreview?: string | null
    }
  | {
      state: 'unverified'
      reason:
        | 'synthetic_input'
        | 'clipboard_paste'
        | 'provider_unavailable'
        | 'window_changed'
        | 'value_mismatch'
      expected?: string | null
      actualPreview?: string | null
    }

export type RuntimeComputerActionMetadata = {
  path: 'accessibility' | 'synthetic' | 'clipboard'
  actionName?: string | null
  fallbackReason?: string | null
  targetWindowId?: number | null
  targetWindowIndex?: number | null
  verification?: RuntimeComputerActionVerification
}

export type RuntimeComputerSnapshotResult = {
  snapshot: RuntimeComputerSnapshotData
  screenshot: RuntimeComputerScreenshotData | null
  screenshotStatus: RuntimeComputerScreenshotStatus
}

export type RuntimeComputerActionResult = RuntimeComputerSnapshotResult & {
  action?: RuntimeComputerActionMetadata
}

export type RuntimeComputerProviderCapabilities = {
  platform: RuntimeHostPlatformName
  provider: string
  providerVersion: string
  protocolVersion: number
  supports: {
    apps: { list: boolean; bundleIds: boolean; pids: boolean }
    windows: {
      list: boolean
      targetById: boolean
      targetByIndex: boolean
      focus: boolean
      moveResize: boolean
    }
    observation: {
      screenshot: boolean
      annotatedScreenshot: boolean
      elementFrames: boolean
      ocr: boolean
    }
    actions: {
      click: boolean
      typeText: boolean
      pressKey: boolean
      hotkey: boolean
      pasteText: boolean
      scroll: boolean
      drag: boolean
      setValue: boolean
      performAction: boolean
    }
    surfaces: { menus: boolean; dialogs: boolean; dock: boolean; menubar: boolean }
  }
}

export type RuntimeComputerWindowListWindow = RuntimeComputerWindowInfo & {
  app: RuntimeComputerAppInfo
  index: number
  isMain?: boolean | null
}

export type RuntimeComputerListWindowsResult = {
  app: RuntimeComputerAppInfo
  windows: RuntimeComputerWindowListWindow[]
}

export type RuntimeComputerListAppsResult = {
  apps: (RuntimeComputerAppInfo & {
    isRunning: boolean
    lastUsedAt: string | null
    useCount: number | null
  })[]
}

export type RuntimeComputerPermissionId = 'accessibility' | 'screenshots'

export type RuntimeComputerPermissionStatus = 'granted' | 'not-granted' | 'unsupported'

export type RuntimeComputerPermissionState = {
  id: RuntimeComputerPermissionId
  status: RuntimeComputerPermissionStatus
}

export type RuntimeComputerPermissionStatusResult = {
  platform: RuntimeHostPlatformName
  helperAppPath: string | null
  helperUnavailableReason: string | null
  permissions: RuntimeComputerPermissionState[]
}

// Why: reset re-reads status after clearing the grants, and additionally
// reports the bundle id the grants were cleared for, so the settings pane can
// name it in the follow-up instructions.
export type RuntimeComputerPermissionResetResult = RuntimeComputerPermissionStatusResult & {
  bundleId: string | null
}

export type RuntimeComputerPermissionSetupResult = {
  platform: RuntimeHostPlatformName
  helperAppPath: string | null
  permissionId?: RuntimeComputerPermissionId
  openedSettings: boolean
  launchedHelper: boolean
  permissions?: RuntimeComputerPermissionState[]
  nextStep?: string | null
}
