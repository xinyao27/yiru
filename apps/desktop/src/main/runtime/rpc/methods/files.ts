/* oxlint-disable max-lines -- Why: file RPC routing coverage stays together so the dispatcher contract for read, write, mutation, and watch methods is easy to audit. */
import { z } from 'zod'
import { getCoworkingResourceQuota } from '~shared/coworking/resource-limits'

import { callerClassOf } from '../access'
import {
  InvalidArgumentError,
  defineMethod,
  defineStreamingMethod,
  type RpcAnyMethod,
  type RpcContext
} from '../core'
import { runFileWatchStream } from './file-watch-stream-lifecycle'
import { assertOutOfTreeFileAccess } from './files-out-of-tree-guard'

let filesWatchSubscriptionSeq = 0
const RUNTIME_FILE_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isValidRuntimeFileBase64(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length % 4 !== 1 && RUNTIME_FILE_BASE64_PATTERN.test(value)
  )
}

const WorktreeSelector = z.object({
  worktree: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing worktree selector'))
})

const FilePathSearch = WorktreeSelector.extend({
  query: z.string().max(256).default(''),
  limit: z.number().int().positive().max(32).default(16)
})

const FileOpen = WorktreeSelector.extend({
  relativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing relative path'))
})

const ResolveTerminalPath = WorktreeSelector.extend({
  pathText: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing path text')),
  terminal: z
    .unknown()
    .transform((v) => (typeof v === 'string' && v.length > 0 ? v : null))
    .nullable()
    .optional(),
  cwd: z
    .unknown()
    .transform((v) => (typeof v === 'string' && v.length > 0 ? v : null))
    .nullable()
    .optional()
})

const TerminalArtifactFile = WorktreeSelector.extend({
  grantId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing terminal artifact grant')),
  absolutePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing terminal artifact path'))
})

const TerminalArtifactFileWrite = TerminalArtifactFile.extend({
  content: z
    .unknown()
    .refine((v): v is string => typeof v === 'string', { message: 'Missing file content' })
})

const FileOpenDiff = FileOpen.extend({
  staged: z.boolean().optional()
})

const FileTreePath = WorktreeSelector.extend({
  relativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string())
})

const ServerDirectoryBrowse = z.object({
  path: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string())
})

// Why: write content must be a real string. Coercing a missing/non-string value
// to '' silently truncated the target file to empty instead of erroring. An
// explicit '' is still accepted (writing an empty file is legitimate).
const FileWrite = FileOpen.extend({
  content: z
    .unknown()
    .refine((v): v is string => typeof v === 'string', { message: 'Missing file content' })
})

const FileWriteBase64 = FileOpen.extend({
  contentBase64: z
    .unknown()
    .refine((v): v is string => typeof v === 'string', { message: 'Missing file content' })
    // Why: Buffer.from(..., 'base64') accepts malformed input by dropping
    // invalid bytes, which can silently create empty or corrupt uploaded files.
    .refine(isValidRuntimeFileBase64, 'File content must be base64')
})

const FileWriteBase64Chunk = FileWriteBase64.extend({
  append: z.boolean().optional()
})

const FileReadChunk = FileOpen.extend({
  offset: z.number().int().nonnegative(),
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024)
})

const FileRename = WorktreeSelector.extend({
  oldRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing source path')),
  newRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing destination path'))
})

const FileCopy = WorktreeSelector.extend({
  sourceRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing source path')),
  destinationRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing destination path'))
})

const FileCommitUpload = WorktreeSelector.extend({
  tempRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing temporary path')),
  finalRelativePath: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing final path'))
})

const FileDelete = FileOpen.extend({
  recursive: z.boolean().optional()
})

const FileSearch = WorktreeSelector.extend({
  query: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing search query')),
  caseSensitive: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  useRegex: z.boolean().optional(),
  includePattern: z.string().optional(),
  excludePattern: z.string().optional(),
  maxResults: z.number().int().positive().optional()
})

const FileListAll = WorktreeSelector.extend({
  excludePaths: z.array(z.string()).optional()
})

const FileUnwatch = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

export const FILE_METHODS: RpcAnyMethod[] = [
  defineMethod({
    name: 'files.list',
    mobile: true,
    params: WorktreeSelector,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) => fileCommands.listMobileFiles(params.worktree)
  }),
  defineMethod({
    name: 'files.searchPaths',
    mobile: true,
    params: FilePathSearch,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.searchMobileFilePaths(params.worktree, params.query, params.limit)
  }),
  defineMethod({
    name: 'files.open',
    mobile: true,
    params: FileOpen,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.openMobileFile(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.openDiff',
    mobile: true,
    params: FileOpenDiff,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.openMobileDiff(params.worktree, params.relativePath, params.staged === true)
  }),
  defineMethod({
    name: 'files.read',
    mobile: true,
    params: FileOpen,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.readMobileFile(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.resolveTerminalPath',
    mobile: true,
    params: ResolveTerminalPath,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { fileCommands, clientId, principal }) => {
      assertOutOfTreeFileAccess(callerClassOf(principal), 'files.resolveTerminalPath')
      return fileCommands.resolveTerminalPath(
        params.worktree,
        params.pathText,
        params.cwd ?? null,
        clientId,
        params.terminal ?? null
      )
    }
  }),
  defineMethod({
    name: 'files.readTerminalArtifact',
    mobile: true,
    params: TerminalArtifactFile,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { fileCommands, clientId, principal }) => {
      assertOutOfTreeFileAccess(callerClassOf(principal), 'files.readTerminalArtifact')
      return fileCommands.readTerminalArtifactFile(
        params.worktree,
        params.grantId,
        params.absolutePath,
        clientId
      )
    }
  }),
  defineMethod({
    name: 'files.readTerminalArtifactPreview',
    mobile: true,
    params: TerminalArtifactFile,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { fileCommands, clientId, principal }) => {
      assertOutOfTreeFileAccess(callerClassOf(principal), 'files.readTerminalArtifactPreview')
      return fileCommands.readTerminalArtifactPreview(
        params.worktree,
        params.grantId,
        params.absolutePath,
        clientId
      )
    }
  }),
  defineMethod({
    name: 'files.writeTerminalArtifact',
    mobile: true,
    params: TerminalArtifactFileWrite,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { fileCommands, clientId, principal }) => {
      assertOutOfTreeFileAccess(callerClassOf(principal), 'files.writeTerminalArtifact')
      return fileCommands.writeTerminalArtifactFile(
        params.worktree,
        params.grantId,
        params.absolutePath,
        params.content,
        clientId
      )
    }
  }),
  defineMethod({
    name: 'files.readPreview',
    mobile: true,
    params: FileOpen,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, context) =>
      context.fileCommands.readFileExplorerPreview(
        params.worktree,
        params.relativePath,
        grantFileReadMaxBytes(context)
      )
  }),
  defineMethod({
    name: 'files.readChunk',
    mobile: true,
    params: FileReadChunk,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, context) =>
      context.fileCommands.readFileExplorerChunk(
        params.worktree,
        params.relativePath,
        params.offset,
        grantBoundedReadLength(context, params.offset, params.length)
      )
  }),
  defineMethod({
    name: 'files.readDir',
    mobile: true,
    params: FileTreePath,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.readFileExplorerDir(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.browseServerDir',
    mobile: true,
    params: ServerDirectoryBrowse,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { runtime, principal }) => {
      assertOutOfTreeFileAccess(callerClassOf(principal), 'files.browseServerDir')
      return runtime.browseServerDir(params.path)
    }
  }),
  defineMethod({
    name: 'files.write',
    params: FileWrite,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.writeFileExplorerFile(params.worktree, params.relativePath, params.content)
  }),
  defineMethod({
    name: 'files.writeBase64',
    params: FileWriteBase64,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.writeFileExplorerFileBase64(
        params.worktree,
        params.relativePath,
        params.contentBase64
      )
  }),
  defineMethod({
    name: 'files.writeBase64Chunk',
    params: FileWriteBase64Chunk,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.writeFileExplorerFileBase64Chunk(
        params.worktree,
        params.relativePath,
        params.contentBase64,
        params.append === true
      )
  }),
  defineMethod({
    name: 'files.createFile',
    mobile: true,
    params: FileOpen,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.createFileExplorerFile(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.createDir',
    params: FileOpen,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.createFileExplorerDir(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.createDirNoClobber',
    params: FileOpen,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.createFileExplorerDirNoClobber(params.worktree, params.relativePath)
  }),
  defineMethod({
    name: 'files.commitUpload',
    params: FileCommitUpload,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.commitFileExplorerUpload(
        params.worktree,
        params.tempRelativePath,
        params.finalRelativePath
      )
  }),
  defineMethod({
    name: 'files.rename',
    params: FileRename,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.renameFileExplorerPath(
        params.worktree,
        params.oldRelativePath,
        params.newRelativePath
      )
  }),
  defineMethod({
    name: 'files.copy',
    params: FileCopy,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.copyFileExplorerPath(
        params.worktree,
        params.sourceRelativePath,
        params.destinationRelativePath
      )
  }),
  defineMethod({
    name: 'files.delete',
    params: FileDelete,
    access: { scope: 'worktree', tier: 'control' },
    handler: async (params, { fileCommands }) =>
      fileCommands.deleteFileExplorerPath(params.worktree, params.relativePath, params.recursive)
  }),
  defineMethod({
    name: 'files.search',
    params: FileSearch,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.searchRuntimeFiles(params.worktree, {
        query: params.query,
        caseSensitive: params.caseSensitive,
        wholeWord: params.wholeWord,
        useRegex: params.useRegex,
        includePattern: params.includePattern,
        excludePattern: params.excludePattern,
        maxResults: params.maxResults
      })
  }),
  defineMethod({
    name: 'files.listAll',
    params: FileListAll,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.listRuntimeFiles(params.worktree, { excludePaths: params.excludePaths })
  }),
  defineMethod({
    name: 'files.listMarkdownDocuments',
    params: WorktreeSelector,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.listRuntimeMarkdownDocuments(params.worktree)
  }),
  defineMethod({
    name: 'files.stat',
    params: FileTreePath,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { fileCommands }) =>
      fileCommands.statRuntimeFile(params.worktree, params.relativePath)
  }),
  defineStreamingMethod({
    name: 'files.watch',
    params: WorktreeSelector,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { runtime, fileCommands, connectionId, signal }, emit) => {
      const seq = ++filesWatchSubscriptionSeq
      const subscriptionId = `files-watch-${connectionId ?? 'inproc'}-${seq}`
      await runFileWatchStream({
        runtime,
        fileCommands,
        worktree: params.worktree,
        connectionId,
        signal,
        subscriptionId,
        emit
      })
    }
  }),
  defineMethod({
    name: 'files.unwatch',
    params: FileUnwatch,
    access: { scope: 'worktree', tier: 'read' },
    handler: async (params, { runtime }) => {
      await runtime.cleanupSubscriptionAndWait(params.subscriptionId)
      return { unsubscribed: true }
    }
  })
]

function grantFileReadMaxBytes(context: RpcContext): number | undefined {
  if (callerClassOf(context.principal) !== 'coworking-host') {
    return undefined
  }
  const grant = context.grantedAccess
  if (!grant) {
    throw new Error('unauthorized')
  }
  return getCoworkingResourceQuota(grant.scope, grant.tier).fileReadMaxBytes
}

function grantBoundedReadLength(
  context: RpcContext,
  offset: number,
  requestedLength: number
): number {
  const maxBytes = grantFileReadMaxBytes(context)
  if (maxBytes === undefined) {
    return requestedLength
  }
  if (offset >= maxBytes) {
    throw new InvalidArgumentError('File read exceeds the grant quota')
  }
  return Math.min(requestedLength, maxBytes - offset)
}
