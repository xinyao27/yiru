import { isLocalPathOpenBlocked } from '~renderer/components/editor/local-path-open-guard'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import type { GlobalSettings } from '~shared/types'

export function shouldBlockEditorTabLocalOpen(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  fileRuntimeEnvironmentId: string | null | undefined,
  connectionId: string | null | undefined
): boolean {
  return isLocalPathOpenBlocked(settingsForRuntimeOwner(settings, fileRuntimeEnvironmentId), {
    connectionId
  })
}
