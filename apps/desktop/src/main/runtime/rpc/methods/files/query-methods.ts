import type {
  FileListAllInput,
  FileSearchInput,
  FileTreePathInput,
  FileWorktreeInput
} from '@yiru/runtime-protocol/contract'
import type { RpcContext } from '~main/runtime/rpc/core'

export async function handleFilesSearch(params: FileSearchInput, { fileCommands }: RpcContext) {
  return fileCommands.searchRuntimeFiles(params.worktree, {
    query: params.query,
    caseSensitive: params.caseSensitive,
    wholeWord: params.wholeWord,
    useRegex: params.useRegex,
    includePattern: params.includePattern,
    excludePattern: params.excludePattern,
    maxResults: params.maxResults
  })
}

export async function handleFilesListAll(params: FileListAllInput, { fileCommands }: RpcContext) {
  return fileCommands.listRuntimeFiles(params.worktree, { excludePaths: params.excludePaths })
}

export async function handleFilesListMarkdownDocuments(
  params: FileWorktreeInput,
  { fileCommands }: RpcContext
) {
  return fileCommands.listRuntimeMarkdownDocuments(params.worktree)
}

export async function handleFilesStat(params: FileTreePathInput, { fileCommands }: RpcContext) {
  return fileCommands.statRuntimeFile(params.worktree, params.relativePath)
}
