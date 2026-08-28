import { getShellRepoHostService } from '~main/project-groups/repos'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellRepoHostHandlers() {
  return {
    repoHost: {
      pickFolder: runtimeImplementation.shell.repoHost.pickFolder.handler(() =>
        getShellRepoHostService().pickFolder()
      ),
      pickFolders: runtimeImplementation.shell.repoHost.pickFolders.handler(() =>
        getShellRepoHostService().pickFolders()
      ),
      pickDirectory: runtimeImplementation.shell.repoHost.pickDirectory.handler(() =>
        getShellRepoHostService().pickDirectory()
      ),
      removeForHost: runtimeImplementation.shell.repoHost.removeForHost.handler(({ input }) =>
        getShellRepoHostService().removeForHost(input)
      ),
      reorderForHost: runtimeImplementation.shell.repoHost.reorderForHost.handler(({ input }) =>
        getShellRepoHostService().reorderForHost(input)
      ),
      cloneAbort: runtimeImplementation.shell.repoHost.cloneAbort.handler(() =>
        getShellRepoHostService().cloneAbort()
      ),
      getDefaultCreateProjectParent:
        runtimeImplementation.shell.repoHost.getDefaultCreateProjectParent.handler(() =>
          getShellRepoHostService().getDefaultCreateProjectParent()
        )
    }
  }
}
