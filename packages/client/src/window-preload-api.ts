import type { PreloadApi } from '@yiru/shared/preload/api-types'
import type {} from 'electron'

// Why: window.api is the renderer's only channel to its host. `electron` is
// typed `unknown` here because the shared UI must not depend on Electron
// types — the desktop preload declares the real ElectronAPI shape itself.
// The empty type import preserves the desktop renderer's legacy Electron
// namespace references without exposing that shape through window.electron.
declare global {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- declaration merging requires interface
  interface Window {
    api: PreloadApi
    electron: unknown
  }
}

export {}
