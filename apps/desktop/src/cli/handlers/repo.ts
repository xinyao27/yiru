import type { CommandHandler } from '../dispatch'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'
import { formatRepoList, formatRepoRefs, formatRepoShow, printResult } from '../format'
import { resolveRepoPathArgument } from '../repo-path-arguments'

export const REPO_HANDLERS: Record<string, CommandHandler> = {
  'repo list': async ({ client, json }) => {
    const result = await client.call(client.rpc.repo.list, undefined)
    printResult(result, json, formatRepoList)
  },
  'repo add': async ({ flags, client, cwd, json }) => {
    const repoPath = getRequiredStringFlag(flags, 'path')
    const result = await client.call(client.rpc.repo.add, {
      path: resolveRepoPathArgument(repoPath, cwd)
    })
    printResult(result, json, formatRepoShow)
  },
  'repo show': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.repo.show, {
      repo: getRequiredStringFlag(flags, 'repo')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo set-base-ref': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.repo.setBaseRef, {
      repo: getRequiredStringFlag(flags, 'repo'),
      ref: getRequiredStringFlag(flags, 'ref')
    })
    printResult(result, json, formatRepoShow)
  },
  'repo search-refs': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.repo.searchRefs, {
      repo: getRequiredStringFlag(flags, 'repo'),
      query: getRequiredStringFlag(flags, 'query'),
      limit: getOptionalPositiveIntegerFlag(flags, 'limit')
    })
    printResult(result, json, formatRepoRefs)
  }
}
