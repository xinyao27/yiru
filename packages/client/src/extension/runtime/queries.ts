import { skipToken } from '@tanstack/react-query'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { getRuntimeTargetOrpc } from '~renderer/runtime/query-target'

import { extensionOrpc } from './orpc'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

export const projectsQuery = extensionOrpc.repo.list.queryOptions()

export const hostsQuery = extensionOrpc.host.list.queryOptions({
  staleTime: 30_000
})

export function worktreesQuery(projectId: string) {
  return extensionOrpc.worktree.list.queryOptions({
    input: { repo: projectId, limit: 500 }
  })
}

export const terminalsQuery = extensionOrpc.terminal.list.queryOptions({
  input: { limit: 500 },
  refetchInterval: 2_000
})

export function filePathsQuery(
  target: RuntimeClientTarget | null,
  worktreeId: string | null,
  query: string
) {
  const normalizedQuery = query.trim()
  return getRuntimeTargetOrpc(target ?? LOCAL_TARGET).files.searchPaths.queryOptions({
    input:
      worktreeId !== null && normalizedQuery.length > 0
        ? { limit: 32, query: normalizedQuery, worktree: worktreeId }
        : skipToken,
    staleTime: 10_000
  })
}

export function workspaceEventsQuery(projectId: string) {
  return extensionOrpc.workspaceEvents.list.queryOptions({
    input: { limit: 500, scope: projectId }
  })
}

export function terminalOutputQuery(handle: string | null) {
  return extensionOrpc.terminal.read.queryOptions({
    input: handle === null ? skipToken : { terminal: handle, limit: 500 },
    refetchInterval: 700
  })
}
