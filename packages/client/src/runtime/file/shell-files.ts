import { callShellOrpc } from '../orpc-client'

// Why: this facade keeps absolute, renderer-authorized path operations visibly
// separate from target-aware `files.*`. Every method fixes its destination to
// the Electron host that renders the current window.
export const shellFilesClient = {
  readFile: (args: {
    filePath: string
    connectionId?: string
    includeLocalLogMetadata?: boolean
  }) =>
    callShellOrpc((client) => client.shell.files.read, {
      filePath: args.filePath,
      includeLocalLogMetadata: args.includeLocalLogMetadata
    }),
  saveDownloadedFile: (input: {
    suggestedName: string
    content: string
    encoding: 'utf8' | 'base64'
  }) => callShellOrpc((client) => client.shell.files.saveDownload, input),
  startDownloadedFile: (input: { suggestedName: string }) =>
    callShellOrpc((client) => client.shell.files.startDownload, input),
  appendDownloadedFileChunk: (input: { transferId: string; contentBase64: string }) =>
    callShellOrpc((client) => client.shell.files.appendDownloadChunk, input),
  finishDownloadedFile: (input: { transferId: string }) =>
    callShellOrpc((client) => client.shell.files.finishDownload, input),
  cancelDownloadedFile: (input: { transferId: string }) =>
    callShellOrpc((client) => client.shell.files.cancelDownload, input),
  startDownloadedFolder: (input: { suggestedName: string }) =>
    callShellOrpc((client) => client.shell.files.startFolderDownload, input),
  createDownloadedFolderDirectory: (input: { transferId: string; pathSegments: string[] }) =>
    callShellOrpc((client) => client.shell.files.createFolderDownloadDirectory, input),
  appendDownloadedFolderFileChunk: (input: {
    transferId: string
    pathSegments: string[]
    contentBase64: string
    first: boolean
    last: boolean
  }) => callShellOrpc((client) => client.shell.files.appendFolderDownloadFileChunk, input),
  finishDownloadedFolder: (input: { transferId: string }) =>
    callShellOrpc((client) => client.shell.files.finishFolderDownload, input),
  cancelDownloadedFolder: (input: { transferId: string }) =>
    callShellOrpc((client) => client.shell.files.cancelFolderDownload, input),
  writeFile: (args: { filePath: string; content: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.write, {
      filePath: args.filePath,
      content: args.content
    }),
  createFile: (args: { filePath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.createFile, { filePath: args.filePath }),
  createDir: (args: { dirPath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.createDirectory, {
      directoryPath: args.dirPath
    }),
  rename: (args: { oldPath: string; newPath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.rename, {
      oldPath: args.oldPath,
      newPath: args.newPath
    }),
  copy: (args: { sourcePath: string; destinationPath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.copy, {
      sourcePath: args.sourcePath,
      destinationPath: args.destinationPath
    }),
  deletePath: (args: { targetPath: string; connectionId?: string; recursive?: boolean }) =>
    callShellOrpc((client) => client.shell.files.delete, {
      targetPath: args.targetPath,
      recursive: args.recursive
    }),
  authorizeExternalPath: (input: { targetPath: string }) =>
    callShellOrpc((client) => client.shell.files.authorizeExternalPath, input),
  stat: (args: { filePath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.stat, { filePath: args.filePath }),
  pathExists: (args: { filePath: string; connectionId?: string }) =>
    callShellOrpc((client) => client.shell.files.pathExists, { filePath: args.filePath }),
  stageExternalPathsForRuntimeUpload: (input: { sourcePaths: string[] }) =>
    callShellOrpc((client) => client.shell.files.stageExternalPathsForRuntimeUpload, input),
  resolveDroppedPathsForAgent: (args: {
    paths: string[]
    worktreePath: string
    connectionId?: string
  }) =>
    callShellOrpc((client) => client.shell.files.resolveDroppedPathsForAgent, {
      paths: args.paths,
      worktreePath: args.worktreePath
    })
}
