import type { ElectronAPI } from '@electron-toolkit/preload'
import type { PreloadApi } from '@yiru/shared/preload/api-types'

// Why: the desktop preload owns the real Electron bridge shape. The renderer
// declares `electron` as unknown in its separate TypeScript program so shared
// UI types never depend on Electron.
declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    api: PreloadApi
    electron: ElectronAPI
  }
}

export {}
