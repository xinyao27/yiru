import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '@yiru/runtime-protocol/contract'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export type BunShellPlatformActions = {
  renderingHost: () => {
    platform: NodeJS.Platform
    osRelease: string
    displayServer: 'wayland' | 'x11' | null
  }
  openPath: (path: string) => Promise<void>
  openInFileManager: (path: string) => Promise<ShellOpenLocalPathResult>
  openInExternalEditor: (
    input: ShellOpenExternalEditorRequest
  ) => Promise<ShellOpenExternalEditorResult>
  openUrl: (url: string) => Promise<void>
  openFilePath: (path: string) => Promise<boolean>
  openFileUri: (uri: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pickAttachment: () => Promise<string | null>
  pickImage: () => Promise<string | null>
  pickRepoIconImage: () => Promise<{ dataUrl: string; fileName: string } | null>
  pickAudio: () => Promise<string | null>
  pickDirectory: (defaultPath?: string) => Promise<string | null>
  pickDirectories: (options?: { defaultPath?: string; multiple?: boolean }) => Promise<string[]>
}

export function createBunShellPlatformHandlers(actions: BunShellPlatformActions) {
  return {
    platform: {
      renderingHost: runtimeImplementation.shell.platform.renderingHost.handler(() =>
        actions.renderingHost()
      ),
      openPath: runtimeImplementation.shell.platform.openPath.handler(({ input }) =>
        actions.openPath(input.path)
      ),
      openInFileManager: runtimeImplementation.shell.platform.openInFileManager.handler(
        ({ input }) => actions.openInFileManager(input.path)
      ),
      openInExternalEditor: runtimeImplementation.shell.platform.openInExternalEditor.handler(
        ({ input }) => actions.openInExternalEditor(input)
      ),
      openUrl: runtimeImplementation.shell.platform.openUrl.handler(({ input }) =>
        actions.openUrl(input.url)
      ),
      openFilePath: runtimeImplementation.shell.platform.openFilePath.handler(({ input }) =>
        actions.openFilePath(input.path)
      ),
      openFileUri: runtimeImplementation.shell.platform.openFileUri.handler(({ input }) =>
        actions.openFileUri(input.uri)
      ),
      pathExists: runtimeImplementation.shell.platform.pathExists.handler(({ input }) =>
        actions.pathExists(input.path)
      ),
      pickAttachment: runtimeImplementation.shell.platform.pickAttachment.handler(() =>
        actions.pickAttachment()
      ),
      pickImage: runtimeImplementation.shell.platform.pickImage.handler(() => actions.pickImage()),
      pickRepoIconImage: runtimeImplementation.shell.platform.pickRepoIconImage.handler(() =>
        actions.pickRepoIconImage()
      ),
      pickAudio: runtimeImplementation.shell.platform.pickAudio.handler(() => actions.pickAudio()),
      pickDirectory: runtimeImplementation.shell.platform.pickDirectory.handler(({ input }) =>
        actions.pickDirectory(input.defaultPath)
      )
    }
  }
}
