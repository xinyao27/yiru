import { type, type ContractRouter } from '@orpc/contract'

import type { ReadClipboardTextOptions } from '../../model/ui.js'
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

// Why: clipboard and zoom belong to the interactive browser client. Mobile
// does not own this surface, so these leaves keep local-only access metadata.
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
  writeClipboardFile: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ filePath: string }>())
    .output(type<{ ok: boolean; reason?: string }>()),
  getZoomLevel: withAccess(SHELL_READ_ACCESS).output(type<number>()),
  setZoomLevel: withAccess(SHELL_HOST_ACCESS).input(type<{ level: number }>()).output(type<void>())
} satisfies ContractRouter<RuntimeProcedureMeta>
