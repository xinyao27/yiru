import { isFolderRepo } from '../../../../../shared/repo-kind'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { YiruRuntimeService } from '../../../yiru-runtime'

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
