import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { isWslUncPath } from '@yiru/workbench-model/platform'

import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'
import { CLIENT_PLATFORM } from './new-workspace'

export function resolveSourceControlLaunchPlatform(args: {
  connectionId?: string | null
  worktreePath?: string | null
  projectRuntime?: ProjectExecutionRuntimeResolution
}): NodeJS.Platform {
  const path = args.worktreePath?.trim() ?? ''
  if (typeof args.connectionId === 'string') {
    return path && isWindowsAbsolutePathLike(path) && !isWslUncPath(path) ? 'win32' : 'linux'
  }
  if (args.projectRuntime?.status === 'repair-required') {
    return args.projectRuntime.repair.preferredRuntime.kind === 'wsl' ? 'linux' : CLIENT_PLATFORM
  }
  if (args.projectRuntime?.status === 'resolved' && args.projectRuntime.runtime.kind === 'wsl') {
    return 'linux'
  }
  if (path && isWslUncPath(path)) {
    return 'linux'
  }
  return CLIENT_PLATFORM
}
