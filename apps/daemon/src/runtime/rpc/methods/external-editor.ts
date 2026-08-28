import type {
  ExternalEditorOpenRemoteSshInput,
  ExternalEditorOpenResult
} from '@yiru/runtime-protocol/contract'
import { EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/runtime-capability-contract'
import { openInExternalEditor } from '~main/external-editor/open'

import type { RpcContext } from '../core'

export async function openRuntimeRemoteSshEditor(
  params: ExternalEditorOpenRemoteSshInput,
  { runtime }: RpcContext
): Promise<ExternalEditorOpenResult> {
  // Why: the method exists in every build, but headless hosts must never
  // launch an editor merely because a client skipped capability probing.
  if (!runtime.getStatus().capabilities?.includes(EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY)) {
    return { ok: false, reason: 'remote-runtime-unsupported' }
  }
  return await openInExternalEditor(params)
}
