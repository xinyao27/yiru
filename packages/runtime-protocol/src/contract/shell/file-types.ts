export type ShellFileReadInput = {
  filePath: string
  includeLocalLogMetadata?: boolean
}

export type ShellFileReadResult = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

export type ShellFileDownloadResult =
  | { canceled: true }
  | { canceled: false; destinationPath: string }

export type ShellFileDownloadSessionResult =
  | { canceled: true }
  | { canceled: false; transferId: string; destinationPath: string }

export type ShellFileDownloadCompleteResult = {
  canceled: false
  destinationPath: string
}

export type ShellFileMutationResult = { ok: true }

export type ShellFileStatResult = {
  size: number
  isDirectory: boolean
  mtime: number
}

export type ShellFileImportSkipReason = 'missing' | 'symlink' | 'permission-denied' | 'unsupported'

export type ShellStagedExternalImportEntry =
  | { relativePath: string; kind: 'directory' }
  | { relativePath: string; kind: 'file'; contentBase64: string }

export type ShellStagedExternalImportSource =
  | {
      sourcePath: string
      status: 'staged'
      name: string
      kind: 'file' | 'directory'
      entries: ShellStagedExternalImportEntry[]
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: ShellFileImportSkipReason
    }
  | {
      sourcePath: string
      status: 'failed'
      reason: string
    }

export type ShellStageExternalPathsResult = {
  sources: ShellStagedExternalImportSource[]
}

export type ShellResolveDroppedPathsResult = {
  resolvedPaths: string[]
  skipped: { sourcePath: string; reason: ShellFileImportSkipReason }[]
  failed: { sourcePath: string; reason: string }[]
}
