import { ORPCError } from '@orpc/server'

import { WorkspaceRevisionConflict } from '../events/log'

export async function withRevisionConflict<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof WorkspaceRevisionConflict) {
      throw new ORPCError('workspaceRevisionConflict', {
        data: {
          actualRevision: error.actualRevision,
          expectedRevision: error.expectedRevision,
          scope: error.scope
        }
      })
    }
    throw error
  }
}
