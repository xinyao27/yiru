import {
  REPO_ADD_CONTRACT,
  REPO_LIST_CONTRACT,
  REPO_SEARCH_REFS_CONTRACT
} from '../../shared/runtime-method-contracts/workspace-contracts'
import type { CommandHandler } from '../dispatch'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'
import { formatRepoList, formatRepoRefs, formatRepoShow, printResult } from '../format'
import { resolveRepoPathArgument } from '../repo-path-arguments'

export const REPO_HANDLERS: Record<string, CommandHandler> = {
  'repo list': async ({ client, json }) => {
    const result = await client.call(REPO_LIST_CONTRACT, undefined)
    printResult(result, json, formatRepoList)
  },
  'repo add': async ({ flags, client, cwd, json }) => {
    const repoPath = getRequiredStringFlag(flags, 'path')
    const result = await client.call(REPO_ADD_CONTRACT, {
      path: resolveRepoPathArgument(repoPath, cwd, client.isRemote, 'Remote repo add')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo show': async ({ flags, client, json }) => {
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.show', {
      repo: getRequiredStringFlag(flags, 'repo')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo set-base-ref': async ({ flags, client, json }) => {
    const result = await client.call<{ repo: Record<string, unknown> }>('repo.setBaseRef', {
      repo: getRequiredStringFlag(flags, 'repo'),
      ref: getRequiredStringFlag(flags, 'ref')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo search-refs': async ({ flags, client, json }) => {
    const result = await client.call(REPO_SEARCH_REFS_CONTRACT, {
      repo: getRequiredStringFlag(flags, 'repo'),
      query: getRequiredStringFlag(flags, 'query'),
      limit: getOptionalPositiveIntegerFlag(flags, 'limit')
    })
    printResult(result, json, formatRepoRefs)
  }
}
