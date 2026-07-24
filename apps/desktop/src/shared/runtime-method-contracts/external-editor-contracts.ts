import { z } from 'zod'

import { defineRuntimeMethodContract } from '../runtime-method-contract'
import type { ShellOpenExternalEditorResult } from '../shell-open-types'

const OpenRemoteSshExternalEditorParams = z
  .object({
    path: z.string().min(1),
    command: z.string().optional(),
    connectionId: z.string().min(1)
  })
  .strict()

export const EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT =
  defineRuntimeMethodContract<ShellOpenExternalEditorResult>()({
    name: 'externalEditor.openRemoteSsh',
    params: OpenRemoteSshExternalEditorParams,
    mobile: false
  })
