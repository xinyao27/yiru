import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { onHostProgressEvent } from '~renderer/runtime/host-progress-stream'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { targetKey } from '~renderer/runtime/query-target'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { worktreeCreationNotification } from './progress'

export function OperationProgressBridge(): null {
  const { runtimeEnvironments } = useProjectCatalog()
  const environmentKey = runtimeEnvironments
    .map((environment) => environment.id)
    .sort()
    .join('\0')
  useEffect(() => {
    const targets: RuntimeClientTarget[] = [
      { kind: 'local' },
      ...environmentKey
        .split('\0')
        .filter(Boolean)
        .map((environmentId) => ({ kind: 'environment' as const, environmentId }))
    ]
    const unsubscribes = targets.map((target) =>
      onHostProgressEvent(target, 'worktreeCreateProgress', (event) => {
        if (!event.operationId) {
          return
        }
        void getExtensionBrowserCapabilities().publishOperationProgress({
          id: `${targetKey(target)}:${event.operationId}`,
          ...worktreeCreationNotification(event)
        })
      })
    )
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
    }
  }, [environmentKey])
  return null
}
