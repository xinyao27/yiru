import type { RuntimeClientEventSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import { onLocalHostProgressEvent } from './host-progress-stream'
import { callRuntimeOrpc, createLocalRuntimeOrpcClient } from './orpc-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import type { RepoWorkspaceApi } from './workspace-host-api'

const LOCAL_TARGET = { kind: 'local' } as const

const localClientEvents = createRuntimeStreamFanOut({
  resolveClient: async () => createLocalRuntimeOrpcClient().client,
  open: (client, signal) => client.runtime.clientEvents.subscribe(undefined, { signal })
})

const localRepoClient: RepoWorkspaceApi = {
  pickFolder: () => window.api.repoHost.pickFolder(),
  pickFolders: () => window.api.repoHost.pickFolders(),
  pickDirectory: () => window.api.repoHost.pickDirectory(),
  removeForHost: (args) => window.api.repoHost.removeForHost(args),
  reorderForHost: (args) => window.api.repoHost.reorderForHost(args),
  cloneAbort: () => window.api.repoHost.cloneAbort(),
  getDefaultCreateProjectParent: () => window.api.repoHost.getDefaultCreateProjectParent(),
  list: async () =>
    (await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.list, undefined)).repos,
  add: async ({ path, kind }) => {
    try {
      return await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.add, { path, kind })
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  create: ({ parentPath, name, kind }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.create, { parentPath, name, kind }),
  clone: async ({ url, destination }) =>
    (
      await callRuntimeOrpc(
        LOCAL_TARGET,
        (client) => client.repo.clone,
        { url, destination },
        { timeoutMs: 10 * 60_000 }
      )
    ).repo,
  isGitAvailable: async () =>
    (await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.gitAvailable, undefined))
      .available,
  remove: async ({ repoId }) => {
    await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.rm, { repo: repoId })
  },
  update: async ({ repoId, updates }) =>
    (
      await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.update, {
        repo: repoId,
        updates
      })
    ).repo,
  onCloneProgress: (callback) =>
    onLocalHostProgressEvent('repoCloneProgress', ({ phase, percent }) =>
      callback({ phase, percent })
    ),
  onChanged: (callback) =>
    localClientEvents.subscribe((event: RuntimeClientEventSubscriptionEvent) => {
      if (event.type === 'reposChanged') {
        callback()
      }
    })
}

export const repoHostClient: RepoWorkspaceApi = localRepoClient
