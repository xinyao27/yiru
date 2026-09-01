import type {
  RuntimeGitHubSubscriptionEvent,
  RuntimeGitHubWorkItemMutatedEvent
} from '@yiru/runtime-protocol/contract'
import {
  getRepoExecutionHostId,
  parseExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type { GitHubPRRefreshEvent, Repo } from '@yiru/runtime-protocol/workbench/types'

import { createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'

function githubEventTarget(repo: Repo): RuntimeClientTarget {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  return host?.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

function subscribeGitHubEvents(
  target: RuntimeClientTarget,
  onEvent: (event: RuntimeGitHubSubscriptionEvent) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(target, { signal: controller.signal })
      const stream = await connection.client.github.events.subscribe(undefined, {
        signal: controller.signal
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        onEvent(event)
      }
    } catch {
      // Why: aborting the owning surface must stay as quiet as the old IPC
      // unsubscribe path; connection failures are retried by its next mount.
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}

export function subscribeGitHubPrRefreshEvents(
  onRefresh: (event: GitHubPRRefreshEvent) => void
): () => void {
  return subscribeGitHubEvents({ kind: 'local' }, (event) => {
    if (event.type === 'prRefresh') {
      onRefresh(event.event)
    }
  })
}

export function subscribeGitHubWorkItemMutations(
  repo: Repo,
  onMutated: (event: RuntimeGitHubWorkItemMutatedEvent) => void
): () => void {
  return subscribeGitHubEvents(githubEventTarget(repo), (event) => {
    if (event.type === 'workItemMutated') {
      onMutated(event.item)
    }
  })
}
