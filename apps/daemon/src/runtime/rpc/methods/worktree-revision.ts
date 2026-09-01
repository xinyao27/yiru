import type { WorkspaceEventLog, WorkspaceEventPayload } from '../../../events/log'
import { withRevisionConflict } from '../../../rpc/revision-conflict'

type WorktreeMutationEvent = {
  kind: string
  payload: WorkspaceEventPayload
}

export async function runWorktreeMutation<T extends object>(
  workspaceEventLog: WorkspaceEventLog | undefined,
  repoId: string,
  expectedRevision: number,
  operation: () => Promise<T> | T,
  eventForResult: (result: T) => WorktreeMutationEvent
): Promise<T | (T & { revision: number })> {
  if (!workspaceEventLog) {
    return operation()
  }
  return withRevisionConflict(() =>
    workspaceEventLog.runAtRevision(repoId, expectedRevision, async () => {
      const result = await operation()
      const event = eventForResult(result)
      const revision = workspaceEventLog.append(repoId, event.kind, event.payload).revision
      return { ...result, revision }
    })
  )
}
