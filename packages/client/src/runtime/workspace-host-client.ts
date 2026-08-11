import { getNativeFiles } from './file/native-files'
import { repoHostClient } from './repo-host-client'
import { worktreeHostClient } from './worktree-host-client'

type WorkspaceHostClient = {
  fileHost: Window['api']['fileHost']
  repos: typeof repoHostClient
  worktrees: typeof worktreeHostClient
}

// Why: workspace features depend on the runtime adapter surface. Desktop
// currently delegates local-only picker/event tails to preload; web supplies
// the same shape while its capability calls terminate on the paired runtime.
export const workspaceHostClient: WorkspaceHostClient = {
  // Why: the web entry installs its preload-compatible adapter after static
  // modules evaluate, so resolve the filesystem member only when it is used.
  get fileHost() {
    return getNativeFiles()
  },
  repos: repoHostClient,
  worktrees: worktreeHostClient
}
