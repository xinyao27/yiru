import { importShellBrowserCookies } from '~main/browser/browser'
import { handleShellEventsSubscribe } from '~main/shell/events'
import { getShellFilesService, requireShellRenderer } from '~main/shell/files'
import { getRenderingHost, getShellPlatformService } from '~main/shell/platform'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeStream } from '../registered-stream'

export const shellRuntimeHandlers = {
  shell: {
    browser: {
      importCookies: runtimeImplementation.shell.browser.importCookies.handler(
        async ({ input, context }) => {
          const renderer = requireShellRenderer(context.renderingWebContentsId)
          return importShellBrowserCookies(renderer.id, input)
        }
      )
    },
    events: {
      subscribe: runtimeImplementation.shell.events.subscribe.handler(
        wireRuntimeStream('shell.events.subscribe', handleShellEventsSubscribe)
      )
    },
    files: {
      read: runtimeImplementation.shell.files.read.handler(({ input }) =>
        getShellFilesService().read(input)
      ),
      saveDownload: runtimeImplementation.shell.files.saveDownload.handler(({ input, context }) =>
        getShellFilesService().saveDownload(
          requireShellRenderer(context.renderingWebContentsId),
          input
        )
      ),
      startDownload: runtimeImplementation.shell.files.startDownload.handler(({ input, context }) =>
        getShellFilesService().startDownload(
          requireShellRenderer(context.renderingWebContentsId),
          input
        )
      ),
      appendDownloadChunk: runtimeImplementation.shell.files.appendDownloadChunk.handler(
        ({ input }) => getShellFilesService().appendDownloadChunk(input)
      ),
      finishDownload: runtimeImplementation.shell.files.finishDownload.handler(({ input }) =>
        getShellFilesService().finishDownload(input)
      ),
      cancelDownload: runtimeImplementation.shell.files.cancelDownload.handler(({ input }) =>
        getShellFilesService().cancelDownload(input)
      ),
      startFolderDownload: runtimeImplementation.shell.files.startFolderDownload.handler(
        ({ input, context }) =>
          getShellFilesService().startFolderDownload(
            requireShellRenderer(context.renderingWebContentsId),
            input
          )
      ),
      createFolderDownloadDirectory:
        runtimeImplementation.shell.files.createFolderDownloadDirectory.handler(
          ({ input, context }) =>
            getShellFilesService().createFolderDownloadDirectory(
              requireShellRenderer(context.renderingWebContentsId),
              input
            )
        ),
      appendFolderDownloadFileChunk:
        runtimeImplementation.shell.files.appendFolderDownloadFileChunk.handler(
          ({ input, context }) =>
            getShellFilesService().appendFolderDownloadFileChunk(
              requireShellRenderer(context.renderingWebContentsId),
              input
            )
        ),
      finishFolderDownload: runtimeImplementation.shell.files.finishFolderDownload.handler(
        ({ input, context }) =>
          getShellFilesService().finishFolderDownload(
            requireShellRenderer(context.renderingWebContentsId),
            input
          )
      ),
      cancelFolderDownload: runtimeImplementation.shell.files.cancelFolderDownload.handler(
        ({ input, context }) =>
          getShellFilesService().cancelFolderDownload(
            requireShellRenderer(context.renderingWebContentsId),
            input
          )
      ),
      write: runtimeImplementation.shell.files.write.handler(({ input }) =>
        getShellFilesService().write(input)
      ),
      createFile: runtimeImplementation.shell.files.createFile.handler(({ input }) =>
        getShellFilesService().createFile(input)
      ),
      createDirectory: runtimeImplementation.shell.files.createDirectory.handler(({ input }) =>
        getShellFilesService().createDirectory(input)
      ),
      rename: runtimeImplementation.shell.files.rename.handler(({ input }) =>
        getShellFilesService().rename(input)
      ),
      copy: runtimeImplementation.shell.files.copy.handler(({ input }) =>
        getShellFilesService().copy(input)
      ),
      delete: runtimeImplementation.shell.files.delete.handler(({ input }) =>
        getShellFilesService().delete(input)
      ),
      authorizeExternalPath: runtimeImplementation.shell.files.authorizeExternalPath.handler(
        ({ input }) => getShellFilesService().authorizeExternalPath(input)
      ),
      stat: runtimeImplementation.shell.files.stat.handler(({ input }) =>
        getShellFilesService().stat(input)
      ),
      pathExists: runtimeImplementation.shell.files.pathExists.handler(({ input }) =>
        getShellFilesService().pathExists(input)
      ),
      stageExternalPathsForRuntimeUpload:
        runtimeImplementation.shell.files.stageExternalPathsForRuntimeUpload.handler(({ input }) =>
          getShellFilesService().stageExternalPathsForRuntimeUpload(input)
        ),
      resolveDroppedPathsForAgent:
        runtimeImplementation.shell.files.resolveDroppedPathsForAgent.handler(({ input }) =>
          getShellFilesService().resolveDroppedPathsForAgent(input)
        )
    },
    platform: {
      renderingHost: runtimeImplementation.shell.platform.renderingHost.handler(() =>
        getRenderingHost()
      ),
      openPath: runtimeImplementation.shell.platform.openPath.handler(({ input }) =>
        getShellPlatformService().openPath(input.path)
      ),
      openInFileManager: runtimeImplementation.shell.platform.openInFileManager.handler(
        ({ input }) => getShellPlatformService().openInFileManager(input.path)
      ),
      openInExternalEditor: runtimeImplementation.shell.platform.openInExternalEditor.handler(
        ({ input }) => getShellPlatformService().openInExternalEditor(input)
      ),
      openUrl: runtimeImplementation.shell.platform.openUrl.handler(({ input }) =>
        getShellPlatformService().openUrl(input.url)
      ),
      openFilePath: runtimeImplementation.shell.platform.openFilePath.handler(({ input }) =>
        getShellPlatformService().openFilePath(input.path)
      ),
      openFileUri: runtimeImplementation.shell.platform.openFileUri.handler(({ input }) =>
        getShellPlatformService().openFileUri(input.uri)
      ),
      pathExists: runtimeImplementation.shell.platform.pathExists.handler(({ input }) =>
        getShellPlatformService().pathExists(input.path)
      ),
      pickAttachment: runtimeImplementation.shell.platform.pickAttachment.handler(() =>
        getShellPlatformService().pickAttachment()
      ),
      pickImage: runtimeImplementation.shell.platform.pickImage.handler(() =>
        getShellPlatformService().pickImage()
      ),
      pickRepoIconImage: runtimeImplementation.shell.platform.pickRepoIconImage.handler(() =>
        getShellPlatformService().pickRepoIconImage()
      ),
      pickAudio: runtimeImplementation.shell.platform.pickAudio.handler(() =>
        getShellPlatformService().pickAudio()
      ),
      pickDirectory: runtimeImplementation.shell.platform.pickDirectory.handler(({ input }) =>
        getShellPlatformService().pickDirectory(input)
      )
    }
  }
} as const
