import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

export type ExternalEditorOpenFailureReason =
  | 'not-absolute'
  | 'not-found'
  | 'launch-failed'
  | 'remote-runtime-unsupported'
  | 'ssh-target-not-found'
  | 'ssh-target-invalid'
  | 'remote-editor-unsupported'

export type ExternalEditorOpenResult =
  | { ok: true }
  | { ok: false; reason: ExternalEditorOpenFailureReason }
  | { ok: false; reason: 'ssh-alias-required'; host: string; port: number }

export const ExternalEditorOpenRemoteSshInputSchema = z
  .object({
    path: z.string().min(1),
    command: z.string().optional(),
    connectionId: z.string().min(1)
  })
  .strict()

export type ExternalEditorOpenRemoteSshInput = z.output<
  typeof ExternalEditorOpenRemoteSshInputSchema
>

export type ExternalEditorOpenRemoteSshLegacyContract = Readonly<{
  name: 'externalEditor.openRemoteSsh'
  params: typeof ExternalEditorOpenRemoteSshInputSchema
  mobile: false
  resultType?: ExternalEditorOpenResult
}>

export const EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT: ExternalEditorOpenRemoteSshLegacyContract = {
  name: 'externalEditor.openRemoteSsh',
  params: ExternalEditorOpenRemoteSshInputSchema,
  mobile: false
}

const EXTERNAL_EDITOR_ACCESS = { scope: 'host', tier: 'host' } as const

export const externalEditorContract = {
  openRemoteSsh: withAccess(EXTERNAL_EDITOR_ACCESS)
    .input(ExternalEditorOpenRemoteSshInputSchema)
    .output(type<ExternalEditorOpenResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
