import type { MarkdownDocument, SearchOptions, SearchResult } from '~shared/types'

import {
  createEmptyRuntimeFileSearchResult,
  getRuntimeFileSearchRejectedField
} from '../file-search-bounds'
import { callRuntimeOrpc } from '../orpc-client'
import { getActiveRuntimeTarget } from '../rpc-client'
import { getRuntimeFileWorktreeSelector, type RuntimeFileOperationArgs } from './context'

export async function searchRuntimeFiles(
  context: RuntimeFileOperationArgs,
  options: SearchOptions
): Promise<SearchResult> {
  if (getRuntimeFileSearchRejectedField(options)) {
    return createEmptyRuntimeFileSearchResult()
  }
  const worktree = requireWorktree(context, 'File search')
  const { rootPath: _rootPath, ...runtimeOptions } = options
  return callRuntimeOrpc(
    getActiveRuntimeTarget(context.settings),
    (client) => client.files.search,
    { worktree, ...runtimeOptions },
    { timeoutMs: 15_000 }
  )
}

export async function listRuntimeFiles(
  context: RuntimeFileOperationArgs,
  args: { rootPath: string; excludePaths?: string[]; requestToken?: string }
): Promise<string[]> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(context.settings),
    (client) => client.files.listAll,
    { worktree: requireWorktree(context, 'File listing'), excludePaths: args.excludePaths },
    { timeoutMs: 15_000 }
  )
}

export function cancelRuntimeFileList(
  _context: RuntimeFileOperationArgs,
  _requestToken: string
): void {
  // Why: files.listAll has no cancellation token on either runtime target;
  // its RPC timeout bounds abandoned scans.
}

export async function listRuntimeMarkdownDocuments(
  context: RuntimeFileOperationArgs,
  _rootPath: string
): Promise<MarkdownDocument[]> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(context.settings),
    (client) => client.files.listMarkdownDocuments,
    { worktree: requireWorktree(context, 'Markdown listing') },
    { timeoutMs: 15_000 }
  )
}

function requireWorktree(context: RuntimeFileOperationArgs, operation: string): string {
  const worktree = getRuntimeFileWorktreeSelector(context)
  if (!worktree) {
    throw new Error(`${operation} requires an owning runtime worktree`)
  }
  return worktree
}
