import type { WorkspaceEventPayload } from '../../../events/log'
import { withRevisionConflict } from '../../../rpc/revision-conflict'
import type { RpcContext } from '../core'

type ProjectCatalogEvent = {
  kind: string
  payload: WorkspaceEventPayload
}

export async function runProjectCatalogMutation<T extends object>(
  workspaceEventLog: RpcContext['workspaceEventLog'],
  expectedRevision: number,
  operation: () => Promise<T> | T,
  eventForResult: (result: T) => ProjectCatalogEvent | null
): Promise<T | (T & { revision: number })> {
  if (!workspaceEventLog) {
    return operation()
  }
  return withRevisionConflict(() =>
    workspaceEventLog.runAtRevision('project-catalog', expectedRevision, async () => {
      const result = await operation()
      const event = eventForResult(result)
      const revision = event
        ? workspaceEventLog.append('project-catalog', event.kind, event.payload).revision
        : workspaceEventLog.revision('project-catalog')
      return { ...result, revision }
    })
  )
}
