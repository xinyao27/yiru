import { getShellGitHubService } from '~main/github/github'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellGitHubHandlers() {
  return {
    gh: {
      viewer: runtimeImplementation.shell.gh.viewer.handler(() => getShellGitHubService().viewer()),
      enqueuePRRefresh: runtimeImplementation.shell.gh.enqueuePRRefresh.handler(({ input }) =>
        getShellGitHubService().enqueuePRRefresh(0, input)
      ),
      reportVisiblePRRefreshCandidates:
        runtimeImplementation.shell.gh.reportVisiblePRRefreshCandidates.handler(({ input }) =>
          getShellGitHubService().reportVisiblePRRefreshCandidates(0, input)
        ),
      checkYiruStarred: runtimeImplementation.shell.gh.checkYiruStarred.handler(() =>
        getShellGitHubService().checkYiruStarred()
      ),
      starYiru: runtimeImplementation.shell.gh.starYiru.handler(({ input }) =>
        getShellGitHubService().starYiru(input)
      )
    }
  }
}
