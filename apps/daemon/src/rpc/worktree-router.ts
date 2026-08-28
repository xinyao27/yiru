import type { WorktreeArchiveService } from '../git/repo/archive'
import { daemonImplementation } from './contract'
import { withRevisionConflict } from './revision-conflict'

export function createWorktreeRouter(services: { archives: WorktreeArchiveService }) {
  return {
    archive: daemonImplementation.worktree.archive.handler(({ input }) =>
      withRevisionConflict(() => services.archives.archive(input))
    ),
    listArchives: daemonImplementation.worktree.listArchives.handler(({ input }) => ({
      archives: services.archives.list(input.repo)
    })),
    restoreArchive: daemonImplementation.worktree.restoreArchive.handler(({ input }) =>
      withRevisionConflict(() => services.archives.restore(input))
    )
  }
}
