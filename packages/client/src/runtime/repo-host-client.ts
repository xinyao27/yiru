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
  add: async ({ expectedRevision, path, kind }) => {
    try {
      return await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.add, {
        expectedRevision,
        path,
        kind
      })
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  },
  create: ({ expectedRevision, parentPath, name, kind }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.create, {
      expectedRevision,
      parentPath,
      name,
      kind
    }),
  clone: ({ expectedRevision, url, destination }) =>
    callRuntimeOrpc(
      LOCAL_TARGET,
      (client) => client.repo.clone,
      { expectedRevision, url, destination },
      { timeoutMs: 10 * 60_000 }
    ),
  isGitAvailable: async () =>
    (await callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.gitAvailable, undefined))
      .available,
  remove: ({ expectedRevision, repoId }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.rm, {
      expectedRevision,
      repo: repoId
    }),
  update: async ({ expectedRevision, repoId, updates }) =>
    callRuntimeOrpc(LOCAL_TARGET, (client) => client.repo.update, {
      expectedRevision,
      repo: repoId,
      updates
    }),
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
