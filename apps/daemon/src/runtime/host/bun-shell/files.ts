import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { createFilesystemService } from '~main/filesystem/filesystem'
import type { NativePathServices } from '~main/filesystem/native-path-services'
import type { Store } from '~main/persistence/store'
import type { RuntimeClientTarget } from '~main/runtime/host/client-target'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

import { getRuntimeHostPathsProvider } from '../paths-provider'

const clientTarget: RuntimeClientTarget = {
  id: 0,
  getType: () => 'extension',
  isDestroyed: () => false,
  once: () => clientTarget,
  removeListener: () => clientTarget,
  send: () => {}
}

export function createBunShellFileHandlers(store: Store) {
  const files = createFilesystemService(store, createNativePathServices())
  return {
    files: {
      read: runtimeImplementation.shell.files.read.handler(({ input }) => files.read(input)),
      readChunk: runtimeImplementation.shell.files.readChunk.handler(({ input }) =>
        files.readChunk(input)
      ),
      saveDownload: runtimeImplementation.shell.files.saveDownload.handler(({ input }) =>
        files.saveDownload(clientTarget, input)
      ),
      startDownload: runtimeImplementation.shell.files.startDownload.handler(({ input }) =>
        files.startDownload(clientTarget, input)
      ),
      appendDownloadChunk: runtimeImplementation.shell.files.appendDownloadChunk.handler(
        ({ input }) => files.appendDownloadChunk(input)
      ),
      finishDownload: runtimeImplementation.shell.files.finishDownload.handler(({ input }) =>
        files.finishDownload(input)
      ),
      cancelDownload: runtimeImplementation.shell.files.cancelDownload.handler(({ input }) =>
        files.cancelDownload(input)
      ),
      startFolderDownload: runtimeImplementation.shell.files.startFolderDownload.handler(
        ({ input }) => files.startFolderDownload(clientTarget, input)
      ),
      createFolderDownloadDirectory:
        runtimeImplementation.shell.files.createFolderDownloadDirectory.handler(({ input }) =>
          files.createFolderDownloadDirectory(clientTarget, input)
        ),
      appendFolderDownloadFileChunk:
        runtimeImplementation.shell.files.appendFolderDownloadFileChunk.handler(({ input }) =>
          files.appendFolderDownloadFileChunk(clientTarget, input)
        ),
      finishFolderDownload: runtimeImplementation.shell.files.finishFolderDownload.handler(
        ({ input }) => files.finishFolderDownload(clientTarget, input)
      ),
      cancelFolderDownload: runtimeImplementation.shell.files.cancelFolderDownload.handler(
        ({ input }) => files.cancelFolderDownload(clientTarget, input)
      ),
      write: runtimeImplementation.shell.files.write.handler(({ input }) => files.write(input)),
      createFile: runtimeImplementation.shell.files.createFile.handler(({ input }) =>
        files.createFile(input)
      ),
      createDirectory: runtimeImplementation.shell.files.createDirectory.handler(({ input }) =>
        files.createDirectory(input)
      ),
      rename: runtimeImplementation.shell.files.rename.handler(({ input }) => files.rename(input)),
      copy: runtimeImplementation.shell.files.copy.handler(({ input }) => files.copy(input)),
      delete: runtimeImplementation.shell.files.delete.handler(({ input }) => files.delete(input)),
      authorizeExternalPath: runtimeImplementation.shell.files.authorizeExternalPath.handler(
        ({ input }) => files.authorizeExternalPath(input)
      ),
      stat: runtimeImplementation.shell.files.stat.handler(({ input }) => files.stat(input)),
      pathExists: runtimeImplementation.shell.files.pathExists.handler(({ input }) =>
        files.pathExists(input)
      ),
      stageExternalPathsForRuntimeUpload:
        runtimeImplementation.shell.files.stageExternalPathsForRuntimeUpload.handler(({ input }) =>
          files.stageExternalPathsForRuntimeUpload(input)
        ),
      resolveDroppedPathsForAgent:
        runtimeImplementation.shell.files.resolveDroppedPathsForAgent.handler(({ input }) =>
          files.resolveDroppedPathsForAgent(input)
        )
    }
  }
}

function createNativePathServices(): NativePathServices {
  return {
    chooseDownloadDirectory: async () => getRuntimeHostPathsProvider().downloadsPath(),
    chooseDownloadFile: async (_rendererId, suggestedName) =>
      uniqueDownloadPath(getRuntimeHostPathsProvider().downloadsPath(), suggestedName),
    trashPath: moveToSystemTrash
  }
}

async function uniqueDownloadPath(directory: string, suggestedName: string): Promise<string> {
  const extension = extname(suggestedName)
  const stem = basename(suggestedName, extension)
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const candidate = join(
      directory,
      suffix === 0 ? suggestedName : `${stem} (${suffix})${extension}`
    )
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  throw new Error('download_destination_unavailable')
}

async function moveToSystemTrash(targetPath: string): Promise<void> {
  const command = trashCommand(targetPath)
  const child = spawn(command.executable, command.args, { stdio: 'ignore', windowsHide: true })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (exitCode !== 0) {
    throw new Error('system_trash_failed')
  }
}

function trashCommand(targetPath: string): { executable: string; args: string[] } {
  if (process.platform === 'darwin') {
    return {
      executable: 'osascript',
      args: [
        '-e',
        'on run argv',
        '-e',
        'tell application "Finder" to delete POSIX file (item 1 of argv)',
        '-e',
        'end run',
        targetPath
      ]
    }
  }
  if (process.platform === 'win32') {
    const recycle =
      'Add-Type -AssemblyName Microsoft.VisualBasic; $p=$args[0]; ' +
      'if ([IO.Directory]::Exists($p)) {[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,"OnlyErrorDialogs","SendToRecycleBin")} ' +
      'else {[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,"OnlyErrorDialogs","SendToRecycleBin")}'
    return { executable: 'powershell.exe', args: ['-NoProfile', '-Command', recycle, targetPath] }
  }
  return { executable: 'gio', args: ['trash', targetPath] }
}
