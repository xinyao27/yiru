import { isWslUncPath } from '@yiru/workbench-model/platform'
import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import type { ProjectExecutionRuntimeResolution } from '~shared/project-execution-runtime'

export type OrchestrationCliCommand = 'yiru' | 'yiru-ide'

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
}): OrchestrationCliCommand {
  if (args.connectionId) {
    return 'yiru'
  }
  if (args.isWsl !== null && args.isWsl !== undefined) {
    return args.isWsl ? 'yiru-ide' : 'yiru'
  }
  if (args.projectRuntime?.status === 'resolved' && args.projectRuntime.runtime.kind === 'wsl') {
    return 'yiru-ide'
  }

  const worktreePath = splitWorktreeIdForFilesystem(args.worktreeId)?.worktreePath
  return worktreePath && isWslUncPath(worktreePath) ? 'yiru-ide' : 'yiru'
}
