import { EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'

import { EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT } from '../../../../shared/runtime-method-contracts/external-editor-contracts'
import { openInExternalEditor } from '../../../ipc/shell'
import { defineMethod, type RpcMethod } from '../core'

export const EXTERNAL_EDITOR_METHODS: RpcMethod[] = [
  defineMethod({
    contract: EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT,
    handler: async (params, { runtime }) => {
      // Why: the method exists in every build, but headless hosts must never
      // launch an editor merely because a client skipped capability probing.
      if (
        !runtime.getStatus().capabilities?.includes(EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY)
      ) {
        return { ok: false as const, reason: 'remote-runtime-unsupported' as const }
      }
      return await openInExternalEditor(params)
    }
  })
]
