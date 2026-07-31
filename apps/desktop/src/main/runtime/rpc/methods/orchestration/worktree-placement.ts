import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import { isFolderRepo } from '~shared/repo-kind'

export async function assertOrchestrationWorktreeCreationSupported(args: {
  runtime: YiruRuntimeService
  repoSelector: string
  existingPlacement: string
}): Promise<void> {
  if (!isFolderRepo(await args.runtime.showRepo(args.repoSelector))) {
    return
  }
  throw new OrchestrationError(
    'invalid_argument',
    `Folder projects cannot create orchestration worktrees; use ${args.existingPlacement}.`
  )
}
