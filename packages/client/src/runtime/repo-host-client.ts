import type { RuntimeClientEventSubscriptionEvent } from '@yiru/runtime-protocol/contract'

import { onLocalHostProgressEvent } from './host-progress-stream'
import { callRuntimeOrpc, createLocalRuntimeOrpcClient } from './orpc-client'
import { shellClient } from './shell-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'
import type { RepoWorkspaceApi } from './workspace-host-api'

const LOCAL_TARGET = { kind: 'local' } as const

const localClientEvents = createRuntimeStreamFanOut({
  resolveClient: async () => (await createLocalRuntimeOrpcClient()).client,
  open: (client, signal) => client.runtime.clientEvents.subscribe(undefined, { signal })
})

const localRepoClient: RepoWorkspaceApi = {
  pickFolder: () => shellClient.repoHost.pickFolder(),
  pickFolders: () => shellClient.repoHost.pickFolders(),
  pickDirectory: () => shellClient.repoHost.pickDirectory(),
  removeForHost: (args) => shellClient.repoHost.removeForHost(args),
  reorderForHost: (args) => shellClient.repoHost.reorderForHost(args),
  cloneAbort: () => shellClient.repoHost.cloneAbort(),
  getDefaultCreateProjectParent: () => shellClient.repoHost.getDefaultCreateProjectParent(),
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
