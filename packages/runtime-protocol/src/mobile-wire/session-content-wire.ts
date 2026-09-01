import { z } from 'zod'

import type {
  RuntimeDirectoryEntry,
  RuntimeFileListResult,
  RuntimeFileMutationResult,
  RuntimeFileOpenResult,
  RuntimeFilePreviewResult,
  RuntimeFileReadResult
} from '../contract/file-result.js' with {
  'resolution-mode': 'import'
}
import type { GitDiffResult } from '../contract/git-results.js' with {
  'resolution-mode': 'import'
}
import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult
} from '../contract/session-tabs-types.js' with {
  'resolution-mode': 'import'
}
import { MobileSessionTabsWorktreeRequestSchema } from './session-tabs-wire.js'

export const MOBILE_MARKDOWN_READ_TAB_ORPC_PATH = '/markdown/readTab'
export const MOBILE_MARKDOWN_SAVE_TAB_ORPC_PATH = '/markdown/saveTab'
export const MOBILE_FILES_READ_ORPC_PATH = '/files/read'
export const MOBILE_FILES_READ_PREVIEW_ORPC_PATH = '/files/readPreview'
export const MOBILE_FILES_READ_DIR_ORPC_PATH = '/files/readDir'
export const MOBILE_FILES_LIST_ORPC_PATH = '/files/list'
export const MOBILE_FILES_CREATE_FILE_ORPC_PATH = '/files/createFile'
export const MOBILE_FILES_OPEN_ORPC_PATH = '/files/open'
export const MOBILE_GIT_DIFF_ORPC_PATH = '/git/diff'

export const MobileMarkdownTabRequestSchema = MobileSessionTabsWorktreeRequestSchema.extend({
  tabId: z.string().min(1)
})

export const MobileMarkdownReadResultSchema = z.object({
  tabId: z.string(),
  filePath: z.string(),
  relativePath: z.string(),
  content: z.string(),
  isDirty: z.boolean(),
  version: z.string(),
  source: z.enum(['draft', 'file']),
  editable: z.boolean(),
  readOnlyReason: z
    .enum(['unsupported_preview', 'unsupported_tab', 'unsupported_untitled', 'file_too_large'])
    .optional()
})

export const MobileMarkdownSaveRequestSchema = MobileMarkdownTabRequestSchema.extend({
  baseVersion: z.string().min(1),
  content: z.string()
})

export const MobileMarkdownSaveResultSchema = z.object({
  tabId: z.string(),
  version: z.string(),
  isDirty: z.literal(false),
  content: z.string()
})

export const MobileFileReadRequestSchema = MobileSessionTabsWorktreeRequestSchema.extend({
  relativePath: z.string().min(1)
})

export const MobileFileDirectoryRequestSchema = MobileSessionTabsWorktreeRequestSchema.extend({
  relativePath: z.string().max(4096)
})

export const MobileDirectoryEntrySchema = z.object({
  name: z.string(),
  isDirectory: z.boolean(),
  isSymlink: z.boolean()
})

export const MobileFileDirectoryResultSchema = z.array(MobileDirectoryEntrySchema)

export const MobileFileListEntrySchema = z.object({
  relativePath: z.string(),
  basename: z.string(),
  kind: z.enum(['text', 'binary'])
})

export const MobileFileListResultSchema = z.object({
  worktree: z.string(),
  rootPath: z.string(),
  files: z.array(MobileFileListEntrySchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean()
})

export const MobileFileReadResultSchema = z.object({
  worktree: z.string(),
  relativePath: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  byteLength: z.number().int().nonnegative()
})

export const MobileFilePreviewResultSchema = z.object({
  content: z.string(),
  isBinary: z.boolean(),
  isImage: z.boolean().optional(),
  mimeType: z.string().optional()
})

export const MobileFileMutationResultSchema = z.object({ ok: z.literal(true) })

export const MobileFileOpenResultSchema = z.object({
  worktree: z.string(),
  relativePath: z.string(),
  kind: z.enum(['markdown', 'text', 'binary', 'image']),
  opened: z.boolean()
})

export const MobileGitDiffRequestSchema = MobileSessionTabsWorktreeRequestSchema.extend({
  filePath: z.string().min(1),
  staged: z.boolean(),
  compareAgainstHead: z.boolean().optional()
})

export const MobileGitDiffResultSchema = z.union([
  z.object({
    kind: z.literal('text'),
    originalContent: z.string(),
    modifiedContent: z.string(),
    originalIsBinary: z.literal(false),
    modifiedIsBinary: z.literal(false)
  }),
  z.object({
    kind: z.literal('binary'),
    originalContent: z.string(),
    modifiedContent: z.string(),
    originalIsBinary: z.boolean(),
    modifiedIsBinary: z.boolean(),
    isImage: z.boolean().optional(),
    mimeType: z.string().optional(),
    modifiedDeleted: z.boolean().optional()
  })
])

export const MOBILE_MARKDOWN_READ_WIRE_IS_COMPATIBLE: RuntimeMarkdownReadTabResult extends z.infer<
  typeof MobileMarkdownReadResultSchema
>
  ? true
  : false = true

export const MOBILE_MARKDOWN_SAVE_WIRE_IS_COMPATIBLE: RuntimeMarkdownSaveTabResult extends z.infer<
  typeof MobileMarkdownSaveResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_READ_WIRE_IS_COMPATIBLE: RuntimeFileReadResult extends z.infer<
  typeof MobileFileReadResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_DIRECTORY_WIRE_IS_COMPATIBLE: RuntimeDirectoryEntry[] extends z.infer<
  typeof MobileFileDirectoryResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_LIST_WIRE_IS_COMPATIBLE: RuntimeFileListResult extends z.infer<
  typeof MobileFileListResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_PREVIEW_WIRE_IS_COMPATIBLE: RuntimeFilePreviewResult extends z.infer<
  typeof MobileFilePreviewResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_MUTATION_WIRE_IS_COMPATIBLE: RuntimeFileMutationResult extends z.infer<
  typeof MobileFileMutationResultSchema
>
  ? true
  : false = true

export const MOBILE_FILE_OPEN_WIRE_IS_COMPATIBLE: RuntimeFileOpenResult extends z.infer<
  typeof MobileFileOpenResultSchema
>
  ? true
  : false = true

export const MOBILE_GIT_DIFF_WIRE_IS_COMPATIBLE: GitDiffResult extends z.infer<
  typeof MobileGitDiffResultSchema
>
  ? true
  : false = true
