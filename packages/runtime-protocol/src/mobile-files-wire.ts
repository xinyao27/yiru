import { z } from 'zod'

import type {
  RuntimeFileListResult,
  RuntimeFileMutationResult,
  RuntimeFilePreviewResult,
  RuntimeFileReadResult
} from './contract/file-result.js' with {
  'resolution-mode': 'import'
}
import type { RuntimeTerminalPathResolution } from './mobile-runtime-types.js' with {
  'resolution-mode': 'import'
}

export const MOBILE_FILES_SEARCH_PATHS_ORPC_PATH = '/files/searchPaths'
export const MOBILE_FILES_RESOLVE_TERMINAL_PATH_ORPC_PATH = '/files/resolveTerminalPath'
export const MOBILE_FILES_READ_TERMINAL_ARTIFACT_ORPC_PATH = '/files/readTerminalArtifact'
export const MOBILE_FILES_READ_TERMINAL_ARTIFACT_PREVIEW_ORPC_PATH =
  '/files/readTerminalArtifactPreview'
export const MOBILE_FILES_WRITE_TERMINAL_ARTIFACT_ORPC_PATH = '/files/writeTerminalArtifact'

export const MobileFilesPathSearchRequestSchema = z.object({
  worktree: z.string().min(1),
  query: z.string().max(256),
  limit: z.number().int().positive().max(32)
})

export const MobileFilesListEntrySchema = z.object({
  relativePath: z.string(),
  basename: z.string(),
  kind: z.enum(['text', 'binary'])
})

export const MobileFilesListResultSchema = z.object({
  worktree: z.string(),
  rootPath: z.string(),
  files: z.array(MobileFilesListEntrySchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export const MobileFilesResolveRequestSchema = z.object({
  worktree: z.string().min(1),
  pathText: z.string().min(1),
  terminal: z.string().min(1).nullable().optional(),
  cwd: z.string().min(1).nullable().optional()
})

export const MobileFilesOpenTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('worktree-file'),
    provider: z.enum(['local', 'ssh']),
    relativePath: z.string(),
    absolutePath: z.string()
  }),
  z.object({
    kind: z.literal('absolute-file'),
    provider: z.enum(['local', 'ssh']),
    absolutePath: z.string(),
    grantId: z.string()
  }),
  z.object({ kind: z.literal('unsupported'), reason: z.string() })
])

export const MobileFilesResolveResultSchema = z.object({
  worktree: z.string(),
  relativePath: z.string().nullable(),
  absolutePath: z.string().nullable(),
  exists: z.boolean(),
  isDirectory: z.boolean(),
  openTarget: MobileFilesOpenTargetSchema.optional()
})

export const MobileTerminalArtifactRequestSchema = z.object({
  worktree: z.string().min(1),
  grantId: z.string().min(1),
  absolutePath: z.string().min(1)
})

export const MobileTerminalArtifactWriteRequestSchema = MobileTerminalArtifactRequestSchema.extend({
  content: z.string()
})

export const MobileTerminalArtifactReadResultSchema = z.object({
  worktree: z.string(),
  relativePath: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  byteLength: z.number().int().nonnegative()
})

export const MobileTerminalArtifactPreviewResultSchema = z.object({
  content: z.string(),
  isBinary: z.boolean(),
  isImage: z.boolean().optional(),
  mimeType: z.string().optional()
})

export const MobileTerminalArtifactMutationResultSchema = z.object({ ok: z.literal(true) })

export const MOBILE_FILES_SEARCH_WIRE_IS_COMPATIBLE: RuntimeFileListResult extends z.infer<
  typeof MobileFilesListResultSchema
>
  ? true
  : false = true

export const MOBILE_FILES_RESOLVE_WIRE_IS_COMPATIBLE: RuntimeTerminalPathResolution extends z.infer<
  typeof MobileFilesResolveResultSchema
>
  ? true
  : false = true

export const MOBILE_FILES_TERMINAL_READ_WIRE_IS_COMPATIBLE: RuntimeFileReadResult extends z.infer<
  typeof MobileTerminalArtifactReadResultSchema
>
  ? true
  : false = true

export const MOBILE_FILES_TERMINAL_PREVIEW_WIRE_IS_COMPATIBLE: RuntimeFilePreviewResult extends z.infer<
  typeof MobileTerminalArtifactPreviewResultSchema
>
  ? true
  : false = true

export const MOBILE_FILES_TERMINAL_WRITE_WIRE_IS_COMPATIBLE: RuntimeFileMutationResult extends z.infer<
  typeof MobileTerminalArtifactMutationResultSchema
>
  ? true
  : false = true
