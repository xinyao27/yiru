import type { QueryClient } from '@tanstack/react-query'

import { extensionOrpc } from './orpc'
import { terminalsQuery, worktreesQuery, workspaceEventsQuery } from './queries'

export async function prefetchExtensionWorkspace(
  queryClient: QueryClient,
  projectId: string
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(worktreesQuery(projectId)),
    queryClient.prefetchQuery(workspaceEventsQuery(projectId)),
    queryClient.prefetchQuery(terminalsQuery),
    queryClient.prefetchQuery(
      extensionOrpc.agentSession.list.queryOptions({
        input: { worktreeId: undefined },
        staleTime: 2_000
      })
    )
  ])
}
