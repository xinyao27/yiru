export type GitProviderMutationOptions = {
  signal?: AbortSignal
}

/** Mutation methods that support a final pre-spawn cancellation check. */
export type IGitMutationProvider = {
  commit(
    worktreePath: string,
    message: string,
    options?: GitProviderMutationOptions
  ): Promise<{ success: boolean; error?: string }>
  stageFile(worktreePath: string, filePath: string): Promise<void>
  unstageFile(worktreePath: string, filePath: string): Promise<void>
  bulkStageFiles(
    worktreePath: string,
    filePaths: string[],
    options?: GitProviderMutationOptions
  ): Promise<void>
  bulkUnstageFiles(
    worktreePath: string,
    filePaths: string[],
    options?: GitProviderMutationOptions
  ): Promise<void>
}
