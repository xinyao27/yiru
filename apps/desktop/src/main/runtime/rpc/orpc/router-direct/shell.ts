import { importShellBrowserCookies } from '~main/browser/browser'
import { getShellClipboardService } from '~main/shell/clipboard'
import { handleShellEventsSubscribe } from '~main/shell/events'
import { getShellFilesService, requireShellRenderer } from '~main/shell/files'
import { getRenderingHost, getShellPlatformService } from '~main/shell/platform'
import { requireShellWindowUi } from '~main/shell/ui'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeStream } from '../registered-stream'
import { shellConfigurationRuntimeHandlers } from './shell/configuration'
import { shellSystemRuntimeHandlers } from './shell/system'
import { shellToolsRuntimeHandlers } from './shell/tools'

export const shellRuntimeHandlers = {
  shell: {
    ...shellConfigurationRuntimeHandlers,
    ...shellSystemRuntimeHandlers,
    ...shellToolsRuntimeHandlers,
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
    },
    ui: {
      readClipboardText: runtimeImplementation.shell.ui.readClipboardText.handler(({ input }) =>
        getShellClipboardService().readText(input)
      ),
      readSelectionClipboardText: runtimeImplementation.shell.ui.readSelectionClipboardText.handler(
        ({ input }) => getShellClipboardService().readSelectionText(input)
      ),
      readClipboardImageBase64: runtimeImplementation.shell.ui.readClipboardImageBase64.handler(
        () => getShellClipboardService().readImageBase64()
      ),
      saveClipboardImageAsTempFile:
        runtimeImplementation.shell.ui.saveClipboardImageAsTempFile.handler(({ input }) =>
          getShellClipboardService().saveImageAsTempFile(input)
        ),
      writeClipboardText: runtimeImplementation.shell.ui.writeClipboardText.handler(({ input }) =>
        getShellClipboardService().writeText(input.text)
      ),
      writeSelectionClipboardText:
        runtimeImplementation.shell.ui.writeSelectionClipboardText.handler(({ input }) =>
          getShellClipboardService().writeSelectionText(input.text)
        ),
      writeClipboardImage: runtimeImplementation.shell.ui.writeClipboardImage.handler(({ input }) =>
        getShellClipboardService().writeImage(input.dataUrl)
      ),
      performNativePaste: runtimeImplementation.shell.ui.performNativePaste.handler(
        ({ input, context }) => {
          const renderer = requireShellRenderer(context.renderingWebContentsId)
          if (input.mode === 'paste-and-match-style') {
            renderer.pasteAndMatchStyle()
            return
          }
          renderer.paste()
        }
      ),
      writeClipboardFile: runtimeImplementation.shell.ui.writeClipboardFile.handler(({ input }) =>
        getShellClipboardService().writeFile(input.filePath)
      ),
      getZoomLevel: runtimeImplementation.shell.ui.getZoomLevel.handler(({ context }) =>
        requireShellRenderer(context.renderingWebContentsId).getZoomLevel()
      ),
      setZoomLevel: runtimeImplementation.shell.ui.setZoomLevel.handler(({ input, context }) => {
        requireShellRenderer(context.renderingWebContentsId).setZoomLevel(input.level)
      }),
      syncTrafficLights: runtimeImplementation.shell.ui.syncTrafficLights.handler(
        ({ input, context }) =>
          requireShellWindowUi(context.renderingWebContentsId).syncTrafficLights(input.zoomFactor)
      ),
      setMarkdownEditorFocused: runtimeImplementation.shell.ui.setMarkdownEditorFocused.handler(
        ({ input, context }) =>
          requireShellWindowUi(context.renderingWebContentsId).setMarkdownEditorFocused(
            input.focused
          )
      ),
      setTerminalInputFocused: runtimeImplementation.shell.ui.setTerminalInputFocused.handler(
        ({ input, context }) =>
          requireShellWindowUi(context.renderingWebContentsId).setTerminalInputFocused(
            input.focused
          )
      ),
      setFloatingTerminalInputFocused:
        runtimeImplementation.shell.ui.setFloatingTerminalInputFocused.handler(
          ({ input, context }) =>
            requireShellWindowUi(context.renderingWebContentsId).setFloatingTerminalInputFocused(
              input.focused
            )
        ),
      setShortcutRecorderFocused: runtimeImplementation.shell.ui.setShortcutRecorderFocused.handler(
        ({ input, context }) =>
          requireShellWindowUi(context.renderingWebContentsId).setShortcutRecorderFocused(
            input.focused
          )
      ),
      minimize: runtimeImplementation.shell.ui.minimize.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).minimize()
      ),
      maximize: runtimeImplementation.shell.ui.maximize.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).maximize()
      ),
      isMaximized: runtimeImplementation.shell.ui.isMaximized.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).isMaximized()
      ),
      requestClose: runtimeImplementation.shell.ui.requestClose.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).requestClose()
      ),
      popupMenu: runtimeImplementation.shell.ui.popupMenu.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).popupMenu()
      ),
      confirmWindowClose: runtimeImplementation.shell.ui.confirmWindowClose.handler(({ context }) =>
        requireShellWindowUi(context.renderingWebContentsId).confirmWindowClose()
      )
    }
  }
} as const
