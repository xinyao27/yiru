import { type, type ContractRouter } from '@orpc/contract'
import type { ReadClipboardTextOptions } from '@yiru/workbench-model/ui'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

const SHELL_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_HOST_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

// Why: clipboard, window chrome, focus routing, and zoom all belong to the
// Electron rendering host. Mobile has no ownership of this surface, so these
// leaves retain the default `mobile: false` access metadata.
export const shellUiContract = {
  readClipboardText: withAccess(SHELL_READ_ACCESS)
    .input(type<ReadClipboardTextOptions | undefined>())
    .output(type<string>()),
  readSelectionClipboardText: withAccess(SHELL_READ_ACCESS)
    .input(type<ReadClipboardTextOptions | undefined>())
    .output(type<string>()),
  readClipboardImageBase64: withAccess(SHELL_READ_ACCESS).output(type<string | null>()),
  saveClipboardImageAsTempFile: withAccess(SHELL_HOST_ACCESS)
    .input(
      type<{ connectionId?: string | null; runtimeEnvironmentId?: string | null } | undefined>()
    )
    .output(type<string | null>()),
  writeClipboardText: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ text: string }>())
    .output(type<void>()),
  writeSelectionClipboardText: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ text: string }>())
    .output(type<void>()),
  writeClipboardImage: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ dataUrl: string }>())
    .output(type<void>()),
  performNativePaste: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ mode?: 'paste' | 'paste-and-match-style' }>())
    .output(type<void>()),
  writeClipboardFile: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ filePath: string }>())
    .output(type<{ ok: boolean; reason?: string }>()),
  getZoomLevel: withAccess(SHELL_READ_ACCESS).output(type<number>()),
  setZoomLevel: withAccess(SHELL_HOST_ACCESS).input(type<{ level: number }>()).output(type<void>()),
  syncTrafficLights: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ zoomFactor: number }>())
    .output(type<void>()),
  setMarkdownEditorFocused: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ focused: boolean }>())
    .output(type<void>()),
  setTerminalInputFocused: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ focused: boolean }>())
    .output(type<void>()),
  setFloatingTerminalInputFocused: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ focused: boolean }>())
    .output(type<void>()),
  setShortcutRecorderFocused: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ focused: boolean }>())
    .output(type<void>()),
  minimize: withAccess(SHELL_HOST_ACCESS).output(type<void>()),
  maximize: withAccess(SHELL_HOST_ACCESS).output(type<void>()),
  isMaximized: withAccess(SHELL_READ_ACCESS).output(type<boolean>()),
  requestClose: withAccess(SHELL_HOST_ACCESS).output(type<void>()),
  popupMenu: withAccess(SHELL_HOST_ACCESS).output(type<void>()),
  confirmWindowClose: withAccess(SHELL_HOST_ACCESS).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
