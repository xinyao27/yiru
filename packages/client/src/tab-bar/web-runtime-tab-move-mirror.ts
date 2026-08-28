import type { RuntimeMobileSessionTabMove } from '@yiru/runtime-protocol/workbench/runtime-types'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import {
  isWebRuntimeSessionActive,
  moveWebRuntimeSessionTab
} from '~renderer/runtime/web-runtime-session'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

export function mirrorWebRuntimeTabMove(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
  }
): void {
  const environmentId = getRuntimeEnvironmentIdForWorktree(
    readProjectCatalogRuntimeState(),
    args.worktreeId
  )
  if (!isWebRuntimeSessionActive(environmentId)) {
    return
  }
  void moveWebRuntimeSessionTab({
    ...args,
    environmentId
  })
}
