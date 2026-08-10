import type {
  GitBulkPathsInputSchema,
  GitFilePathInputSchema
} from '@yiru/runtime-protocol/contract'
import type { z } from 'zod'

import type { RpcContext } from '../core'

export const handleGitStage = (
  params: z.infer<typeof GitFilePathInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.stageRuntimeGitPath(params.worktree, params.filePath)

export const handleGitBulkStage = (
  params: z.infer<typeof GitBulkPathsInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.bulkStageRuntimeGitPaths(params.worktree, params.filePaths)

export const handleGitUnstage = (
  params: z.infer<typeof GitFilePathInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.unstageRuntimeGitPath(params.worktree, params.filePath)

export const handleGitBulkUnstage = (
  params: z.infer<typeof GitBulkPathsInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.bulkUnstageRuntimeGitPaths(params.worktree, params.filePaths)

export const handleGitDiscard = (
  params: z.infer<typeof GitFilePathInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.discardRuntimeGitPath(params.worktree, params.filePath)

export const handleGitBulkDiscard = (
  params: z.infer<typeof GitBulkPathsInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.bulkDiscardRuntimeGitPaths(params.worktree, params.filePaths)
