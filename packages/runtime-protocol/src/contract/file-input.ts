import { z } from 'zod'

const RUNTIME_FILE_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isValidRuntimeFileBase64(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length % 4 !== 1 && RUNTIME_FILE_BASE64_PATTERN.test(value)
  )
}

export const FileWorktreeInputSchema = z.object({
  worktree: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing worktree selector'))
})

export const FilePathSearchInputSchema = FileWorktreeInputSchema.extend({
  query: z.string().max(256).default(''),
  limit: z.number().int().positive().max(32).default(16)
})

export const FileOpenInputSchema = FileWorktreeInputSchema.extend({
  relativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing relative path'))
})

export const FileOpenDiffInputSchema = FileOpenInputSchema.extend({
  staged: z.boolean().optional()
})

export const FileResolveTerminalPathInputSchema = FileWorktreeInputSchema.extend({
  pathText: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing path text')),
  terminal: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : null))
    .nullable()
    .optional(),
  cwd: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : null))
    .nullable()
    .optional()
})

export const FileTerminalArtifactInputSchema = FileWorktreeInputSchema.extend({
  grantId: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing terminal artifact grant')),
  absolutePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing terminal artifact path'))
})

export const FileTerminalArtifactWriteInputSchema = FileTerminalArtifactInputSchema.extend({
  content: z.unknown().refine((value): value is string => typeof value === 'string', {
    message: 'Missing file content'
  })
})

export const FileTreePathInputSchema = FileWorktreeInputSchema.extend({
  relativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string())
})

export const FileServerDirectoryInputSchema = z.object({
  path: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string())
})

// Why: coercing a missing or non-string value to empty content can silently
// truncate an existing file; an explicitly empty string remains valid.
export const FileWriteInputSchema = FileOpenInputSchema.extend({
  content: z.unknown().refine((value): value is string => typeof value === 'string', {
    message: 'Missing file content'
  })
})

export const FileWriteBase64InputSchema = FileOpenInputSchema.extend({
  contentBase64: z
    .unknown()
    .refine((value): value is string => typeof value === 'string', {
      message: 'Missing file content'
    })
    // Why: Buffer's base64 decoder drops invalid bytes instead of rejecting
    // them, which can otherwise create an empty or corrupt uploaded file.
    .refine(isValidRuntimeFileBase64, 'File content must be base64')
})

export const FileWriteBase64ChunkInputSchema = FileWriteBase64InputSchema.extend({
  append: z.boolean().optional()
})

export const FileReadChunkInputSchema = FileOpenInputSchema.extend({
  offset: z.number().int().nonnegative(),
  length: z
    .number()
    .int()
    .positive()
    .max(512 * 1024)
})

export const FileRenameInputSchema = FileWorktreeInputSchema.extend({
  oldRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing source path')),
  newRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing destination path'))
})

export const FileCopyInputSchema = FileWorktreeInputSchema.extend({
  sourceRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing source path')),
  destinationRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing destination path'))
})

export const FileCommitUploadInputSchema = FileWorktreeInputSchema.extend({
  tempRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing temporary path')),
  finalRelativePath: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing final path'))
})

export const FileDeleteInputSchema = FileOpenInputSchema.extend({
  recursive: z.boolean().optional()
})

export const FileSearchInputSchema = FileWorktreeInputSchema.extend({
  query: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : ''))
    .pipe(z.string().min(1, 'Missing search query')),
  caseSensitive: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  useRegex: z.boolean().optional(),
  includePattern: z.string().optional(),
  excludePattern: z.string().optional(),
  maxResults: z.number().int().positive().optional()
})

export const FileListAllInputSchema = FileWorktreeInputSchema.extend({
  excludePaths: z.array(z.string()).optional()
})

export const FileUnwatchInputSchema = z.object({
  subscriptionId: z
    .unknown()
    .transform((value) => (typeof value === 'string' && value.length > 0 ? value : ''))
    .pipe(z.string().min(1, 'Missing subscriptionId'))
})

export type FileWorktreeInput = z.output<typeof FileWorktreeInputSchema>
export type FilePathSearchInput = z.output<typeof FilePathSearchInputSchema>
export type FileOpenInput = z.output<typeof FileOpenInputSchema>
export type FileOpenDiffInput = z.output<typeof FileOpenDiffInputSchema>
export type FileResolveTerminalPathInput = z.output<typeof FileResolveTerminalPathInputSchema>
export type FileTerminalArtifactInput = z.output<typeof FileTerminalArtifactInputSchema>
export type FileTerminalArtifactWriteInput = z.output<typeof FileTerminalArtifactWriteInputSchema>
export type FileTreePathInput = z.output<typeof FileTreePathInputSchema>
export type FileServerDirectoryInput = z.output<typeof FileServerDirectoryInputSchema>
export type FileWriteInput = z.output<typeof FileWriteInputSchema>
export type FileWriteBase64Input = z.output<typeof FileWriteBase64InputSchema>
export type FileWriteBase64ChunkInput = z.output<typeof FileWriteBase64ChunkInputSchema>
export type FileReadChunkInput = z.output<typeof FileReadChunkInputSchema>
export type FileRenameInput = z.output<typeof FileRenameInputSchema>
export type FileCopyInput = z.output<typeof FileCopyInputSchema>
export type FileCommitUploadInput = z.output<typeof FileCommitUploadInputSchema>
export type FileDeleteInput = z.output<typeof FileDeleteInputSchema>
export type FileSearchInput = z.output<typeof FileSearchInputSchema>
export type FileListAllInput = z.output<typeof FileListAllInputSchema>
export type FileUnwatchInput = z.output<typeof FileUnwatchInputSchema>

export const FileLogTailReadInputSchema = z.object({
  filePath: z.string().min(1, 'Missing filePath'),
  fromByteOffset: z.number().int().min(0),
  expectedIdentity: z.string().optional()
})

export const FileLogTailWatchInputSchema = z.object({
  filePath: z.string().min(1, 'Missing filePath'),
  subscriptionId: z.string().min(1, 'Missing subscriptionId').max(200)
})

export type FileLogTailReadInput = z.output<typeof FileLogTailReadInputSchema>
export type FileLogTailWatchInput = z.output<typeof FileLogTailWatchInputSchema>
