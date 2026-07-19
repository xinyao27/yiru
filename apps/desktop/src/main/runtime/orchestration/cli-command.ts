import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'

export type OrchestrationCliCommand = 'yiru'

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
}): OrchestrationCliCommand {
  void args
  return 'yiru'
}
