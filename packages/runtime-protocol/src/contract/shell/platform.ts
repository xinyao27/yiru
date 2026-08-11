import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

export type ShellOpenPathFailureReason =
  | 'not-absolute'
  | 'not-found'
  | 'launch-failed'
  | 'remote-runtime-unsupported'
  | 'ssh-target-not-found'
  | 'ssh-target-invalid'
  | 'remote-editor-unsupported'

export type ShellOpenLocalPathResult =
  | { ok: true }
  | {
      ok: false
      reason: Extract<
        ShellOpenPathFailureReason,
        'not-absolute' | 'not-found' | 'launch-failed' | 'remote-runtime-unsupported'
      >
    }

export type ShellOpenExternalEditorRequest = {
  path: string
  command?: string
  connectionId?: string | null
}

export type ShellOpenExternalEditorResult =
  | { ok: true }
  | { ok: false; reason: Exclude<ShellOpenPathFailureReason, 'ssh-alias-required'> }
  | { ok: false; reason: 'ssh-alias-required'; host: string; port: number }

export type ShellRenderingHost = {
  platform: NodeJS.Platform
  osRelease: string
  displayServer: 'wayland' | 'x11' | null
}

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

// Why: these leaves operate on the OS host rendering this Electron window,
// never the selected runtime target. Mobile therefore remains excluded by
// the default `mobile: false` access metadata.
export const shellPlatformContract = {
  renderingHost: withAccess(SHELL_READ_ACCESS).output(type<ShellRenderingHost>()),
  openPath: withAccess(SHELL_HOST_ACCESS).input(type<{ path: string }>()).output(type<void>()),
  openInFileManager: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ path: string }>())
    .output(type<ShellOpenLocalPathResult>()),
  openInExternalEditor: withAccess(SHELL_HOST_ACCESS)
    .input(type<ShellOpenExternalEditorRequest>())
    .output(type<ShellOpenExternalEditorResult>()),
  openUrl: withAccess(SHELL_HOST_ACCESS).input(type<{ url: string }>()).output(type<void>()),
  openFilePath: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ path: string }>())
    .output(type<boolean>()),
  openFileUri: withAccess(SHELL_HOST_ACCESS).input(type<{ uri: string }>()).output(type<void>()),
  pathExists: withAccess(SHELL_READ_ACCESS).input(type<{ path: string }>()).output(type<boolean>()),
  pickAttachment: withAccess(SHELL_HOST_ACCESS).output(type<string | null>()),
  pickImage: withAccess(SHELL_HOST_ACCESS).output(type<string | null>()),
  pickRepoIconImage:
    withAccess(SHELL_HOST_ACCESS).output(type<{ dataUrl: string; fileName: string } | null>()),
  pickAudio: withAccess(SHELL_HOST_ACCESS).output(type<string | null>()),
  pickDirectory: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ defaultPath?: string }>())
    .output(type<string | null>())
} satisfies ContractRouter<RuntimeProcedureMeta>
