import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import { invalidateProjectCatalogTarget } from '~renderer/project-catalog/refresh'
import { createRuntimeOrpcClient, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { getRuntimeTargetOrpc, targetKey } from '~renderer/runtime/query-target'

import { extensionOrpc } from './orpc'
import { terminalsQuery, worktreesQuery, workspaceEventsQuery } from './queries'

const lastSeenByScope = new Map<string, number>()
const PROJECT_CATALOG_SCOPE = 'project-catalog'

export function WorkspaceEventBridge(): null {
  const { repos, runtimeEnvironments } = useProjectCatalog()
  const queryClient = useQueryClient()
  const scopes = [
    `local\t${PROJECT_CATALOG_SCOPE}`,
    ...runtimeEnvironments.map(
      (environment) => `environment:${environment.id}\t${PROJECT_CATALOG_SCOPE}`
    ),
    ...repos.map((repo) => `${targetKey(projectCatalogTargetForRepo(repo))}\t${repo.id}`)
  ]
    .sort()
    .join('\0')
  useEffect(() => {
    const controllers = scopes
      .split('\0')
      .filter(Boolean)
      .map(parseScopeEntry)
      .filter((entry) => entry !== null)
      .map(({ scope, target }) => {
        const controller = new AbortController()
        void consumeScope(target, scope, controller.signal, async () => {
          if (scope === PROJECT_CATALOG_SCOPE) {
            await invalidateProjectCatalogTarget(queryClient, target)
            return
          }
          const targetOrpc = getRuntimeTargetOrpc(target)
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: targetOrpc.workspaceEvents.list.queryKey({ input: { scope } })
            }),
            queryClient.invalidateQueries({
              queryKey: targetOrpc.worktree.detectedList.queryKey({ input: { repo: scope } })
            }),
            queryClient.invalidateQueries({ queryKey: targetOrpc.terminal.key() }),
            queryClient.invalidateQueries({ queryKey: targetOrpc.agentSession.key() }),
            ...(target.kind === 'local'
              ? [
                  queryClient.invalidateQueries({
                    queryKey: workspaceEventsQuery(scope).queryKey
                  }),
                  queryClient.invalidateQueries({ queryKey: worktreesQuery(scope).queryKey }),
                  queryClient.invalidateQueries({ queryKey: terminalsQuery.queryKey }),
                  queryClient.invalidateQueries({ queryKey: extensionOrpc.agentSession.key() })
                ]
              : [])
          ])
        })
        return controller
      })
    return () => {
      for (const controller of controllers) {
        controller.abort()
      }
    }
  }, [queryClient, scopes])
  return null
}

async function consumeScope(
  target: RuntimeClientTarget,
  scope: string,
  signal: AbortSignal,
  invalidate: () => Promise<void>
): Promise<void> {
  const cursorKey = `${targetKey(target)}:${scope}`
  while (!signal.aborted) {
    let close = (): void => {}
    try {
      const connection = await createRuntimeOrpcClient(target, { signal })
      close = connection.close
      const subscription = await connection.client.workspaceEvents.subscribe(
        { afterId: lastSeenByScope.get(cursorKey) ?? 0, scope },
        { signal }
      )
      for await (const message of subscription) {
        if (signal.aborted) {
          return
        }
        if (message.type === 'event') {
          lastSeenByScope.set(cursorKey, message.event.id)
          await invalidate()
        }
      }
    } catch {
      if (!signal.aborted) {
        await waitForRetry(signal)
      }
    } finally {
      close()
    }
  }
}

function parseScopeEntry(value: string): { scope: string; target: RuntimeClientTarget } | null {
  const separator = value.indexOf('\t')
  if (separator <= 0) {
    return null
  }
  const targetToken = value.slice(0, separator)
  const scope = value.slice(separator + 1)
  if (!scope) {
    return null
  }
  if (targetToken === 'local') {
    return { scope, target: { kind: 'local' } }
  }
  const prefix = 'environment:'
  return targetToken.startsWith(prefix) && targetToken.length > prefix.length
    ? {
        scope,
        target: { kind: 'environment', environmentId: targetToken.slice(prefix.length) }
      }
    : null
}

async function waitForRetry(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 1_500)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true }
    )
  })
}
