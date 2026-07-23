import { z } from 'zod'

import { defineRuntimeMethodContract } from '../runtime-method-contract'
import type {
  RuntimeRepoList,
  RuntimeRepoSearchRefs,
  RuntimeWorktreeListResult,
  RuntimeWorktreeRecord,
  RuntimeWorktreeRemoveResult
} from '../runtime-types'
import type { CreateWorktreeResult, Repo } from '../types'
import { OptionalFiniteNumber, requiredString } from './runtime-method-params'
import {
  WorktreeCreate,
  WorktreeListParams,
  WorktreeRemove,
  WorktreeSet
} from './worktree-method-params'

const RepoPath = z.object({
  path: requiredString('Missing repo path'),
  kind: z.enum(['git', 'folder']).optional()
})

const RepoSearchRefs = z.object({
  repo: requiredString('Missing repo selector'),
  query: z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value : undefined))
    .pipe(z.string({ message: 'Missing query' })),
  limit: OptionalFiniteNumber
})

export const REPO_LIST_CONTRACT = defineRuntimeMethodContract<RuntimeRepoList>()({
  name: 'repo.list',
  params: null,
  mobile: true
})

export const REPO_ADD_CONTRACT = defineRuntimeMethodContract<{ repo: Repo }>()({
  name: 'repo.add',
  params: RepoPath,
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
