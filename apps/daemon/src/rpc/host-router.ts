import type { HostRegistry } from '../hosts/registry'
import type { ProjectStore } from '../projects/store'
import { daemonImplementation } from './contract'
import { withRevisionConflict } from './revision-conflict'

export function createHostRouter(hosts: HostRegistry, projects: ProjectStore) {
  return {
    add: daemonImplementation.host.add.handler(({ input }) =>
      withRevisionConflict(() => hosts.add(input))
    ),
    list: daemonImplementation.host.list.handler(() => ({
      hosts: hosts.list(),
      revision: hosts.revision()
    })),
    probe: daemonImplementation.host.probe.handler(({ input }) => hosts.probe(input.hostId)),
    remove: daemonImplementation.host.remove.handler(({ input }) =>
      withRevisionConflict(() =>
        hosts.remove(input.hostId, input.expectedRevision, () => {
          if (
            projects.list().some((project) => (project.executionHostId ?? 'local') === input.hostId)
          ) {
            throw new Error('host_has_projects')
          }
        })
      )
    )
  }
}
