import { RepoPathInputSchema, type RuntimeRepoResult } from '@yiru/runtime-protocol/contract'
import { defineRuntimeMethodContract } from '@yiru/runtime-protocol/workbench/runtime-method-contract'
import type {
  RuntimeRepoSearchRefs,
  RuntimeWorktreeListResult,
  RuntimeWorktreeRecord,
  RuntimeWorktreeRemoveResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { CreateWorktreeResult } from '@yiru/runtime-protocol/workbench/types'
import { z } from 'zod'

import { OptionalFiniteNumber, requiredString } from './runtime-method-params'
import {
  WorktreeCreate,
  WorktreeListParams,
  WorktreeRemove,
  WorktreeSet
} from './worktree-method-params'

const RepoSearchRefs = z.object({
  repo: requiredString('Missing repo selector'),
  query: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : undefined))
    .pipe(z.string({ message: 'Missing query' })),
  limit: OptionalFiniteNumber
})

export const REPO_ADD_CONTRACT = defineRuntimeMethodContract<RuntimeRepoResult>()({
  name: 'repo.add',
  params: RepoPathInputSchema,
  mobile: false
})

export const REPO_SEARCH_REFS_CONTRACT = defineRuntimeMethodContract<RuntimeRepoSearchRefs>()({
  name: 'repo.searchRefs',
  params: RepoSearchRefs,
  mobile: true
})

export const WORKTREE_LIST_CONTRACT = defineRuntimeMethodContract<RuntimeWorktreeListResult>()({
  name: 'worktree.list',
  params: WorktreeListParams,
  mobile: false
})

export const WORKTREE_CREATE_CONTRACT = defineRuntimeMethodContract<
  CreateWorktreeResult & { agentTerminalHandle?: string }
>()({
  name: 'worktree.create',
  params: WorktreeCreate,
  mobile: true
})

export const WORKTREE_SET_CONTRACT = defineRuntimeMethodContract<{
  revision?: number
  worktree: RuntimeWorktreeRecord
}>()({
  name: 'worktree.set',
  params: WorktreeSet,
  mobile: true
})

export const WORKTREE_REMOVE_CONTRACT = defineRuntimeMethodContract<RuntimeWorktreeRemoveResult>()({
  name: 'worktree.rm',
  params: WorktreeRemove,
  mobile: true
})
