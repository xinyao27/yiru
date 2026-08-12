import { shellFilesClient } from './file/shell-files'
import { repoHostClient } from './repo-host-client'
import { worktreeHostClient } from './worktree-host-client'

type WorkspaceHostClient = {
  fileHost: typeof shellFilesClient
  repos: typeof repoHostClient
  worktrees: typeof worktreeHostClient
}

// Why: workspace features depend on one oRPC host surface. Grouping these
// domain clients keeps desktop and paired Web callers aligned without adding
// another renderer facade.
export const workspaceHostClient: WorkspaceHostClient = {
  fileHost: shellFilesClient,
  repos: repoHostClient,
  worktrees: worktreeHostClient
}
