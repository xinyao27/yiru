import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult,
  ShellRenderingHost
} from '@yiru/runtime-protocol/contract'
import { parseRenderingHostBootstrap } from '~shared/rendering-host-bootstrap'

import { callShellOrpc, isWebRuntimeClient } from './orpc-client'

export type ShellPlatformApi = {
  openPath: (path: string) => Promise<void>
  openInFileManager: (path: string) => Promise<ShellOpenLocalPathResult>
  openInExternalEditor: {
    (request: ShellOpenExternalEditorRequest): Promise<ShellOpenExternalEditorResult>
    (path: string, command?: string): Promise<ShellOpenLocalPathResult>
  }
  openUrl: (url: string) => Promise<void>
  openFilePath: (path: string) => Promise<boolean>
  openFileUri: (uri: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pickAttachment: () => Promise<string | null>
  pickImage: () => Promise<string | null>
  pickRepoIconImage: () => Promise<{ dataUrl: string; fileName: string } | null>
  pickAudio: () => Promise<string | null>
  pickDirectory: (args: { defaultPath?: string }) => Promise<string | null>
}

function resolveRenderingHost(): ShellRenderingHost {
  if (!isWebRuntimeClient() && typeof location !== 'undefined') {
    const bootstrap = parseRenderingHostBootstrap(location.search)
    if (bootstrap) {
      return bootstrap
    }
  }
  const userAgent = navigator.userAgent.toLowerCase()
  return {
    platform: userAgent.includes('mac') ? 'darwin' : userAgent.includes('win') ? 'win32' : 'linux',
    osRelease: '',
    displayServer: null
  }
}

const renderingHostSnapshot = resolveRenderingHost()

export function getRenderingHostSnapshot(): ShellRenderingHost {
  return renderingHostSnapshot
}

function openInExternalEditor(
  request: ShellOpenExternalEditorRequest
): Promise<ShellOpenExternalEditorResult>
function openInExternalEditor(path: string, command?: string): Promise<ShellOpenLocalPathResult>
function openInExternalEditor(
  request: ShellOpenExternalEditorRequest | string,
  command?: string
): Promise<ShellOpenExternalEditorResult> {
  return callShellOrpc(
    (client) => client.shell.platform.openInExternalEditor,
    typeof request === 'string' ? { path: request, command } : request
  )
}

export const electronShellPlatformApi: ShellPlatformApi = {
  openPath: (path) => callShellOrpc((client) => client.shell.platform.openPath, { path }),
  openInFileManager: (path) =>
    callShellOrpc((client) => client.shell.platform.openInFileManager, { path }),
  openInExternalEditor,
  openUrl: (url) => callShellOrpc((client) => client.shell.platform.openUrl, { url }),
  openFilePath: (path) => callShellOrpc((client) => client.shell.platform.openFilePath, { path }),
  openFileUri: (uri) => callShellOrpc((client) => client.shell.platform.openFileUri, { uri }),
  pathExists: (path) => callShellOrpc((client) => client.shell.platform.pathExists, { path }),
  pickAttachment: () => callShellOrpc((client) => client.shell.platform.pickAttachment, undefined),
  pickImage: () => callShellOrpc((client) => client.shell.platform.pickImage, undefined),
  pickRepoIconImage: () =>
    callShellOrpc((client) => client.shell.platform.pickRepoIconImage, undefined),
  pickAudio: () => callShellOrpc((client) => client.shell.platform.pickAudio, undefined),
  pickDirectory: (input) => callShellOrpc((client) => client.shell.platform.pickDirectory, input)
}
