import { isWslUncPath } from '@yiru/runtime-protocol/model/platform'
import { splitWorktreeIdForFilesystem } from '@yiru/runtime-protocol/model/workspace'
import type { ProjectExecutionRuntimeResolution } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import {
  getYiruCliEnvironment,
  resolveYiruCliCommandName
} from '@yiru/runtime-protocol/workbench/yiru-cli-command-name'

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isPackaged: boolean
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
}): string {
  const environment = getYiruCliEnvironment(args.isPackaged)
  if (args.connectionId) {
    // Why: orchestration instructions run inside the connected host, which has
    // its own packaged relay CLI rather than this checkout's local dev shim.
    return resolveYiruCliCommandName({
      environment: 'production',
      platform: process.platform
    })
  }
  if (args.isWsl !== null && args.isWsl !== undefined) {
    return resolveYiruCliCommandName({
      environment,
      executionHost: args.isWsl ? 'wsl' : 'native',
      platform: process.platform
    })
  }

  const worktreePath = splitWorktreeIdForFilesystem(args.worktreeId)?.worktreePath
  const isWsl =
    (args.projectRuntime?.status === 'resolved' && args.projectRuntime.runtime.kind === 'wsl') ||
    Boolean(worktreePath && isWslUncPath(worktreePath))
  return resolveYiruCliCommandName({
    environment,
    executionHost: isWsl ? 'wsl' : 'native',
    platform: process.platform
  })
}
