import { oc, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

// Why: Phase 5 step 4, `pty` group A (the only one of the family's four groups
// that belongs on this reverse contract — see the Phase 5 note above
// `runtime-orpc-migration.md`'s step 4). Collapses `pty.ts`'s hand-rolled
// `randomUUID()` + `mainWindow.webContents.send('pty:serializeBuffer:request', …)`
// + `ipcMain.on('pty:serializeBuffer:response', …)` request-ID dispatch table
// into one procedure whose return value is the reply — same shape as
// `terminal.create`/`reveal` above. A remote/mobile client's request for a
// PTY's buffer needs the exact xterm.js-rendered screen state, which only a
// live renderer with a mounted `SerializeAddon` can produce; there is no
// provider-side equivalent. Unlike `terminal.create`/`reveal`, a missing
// serializer for `ptyId` (pane torn down, never mounted) is not the caller's
// error — the pre-migration behavior resolved `null` for that case exactly
// like a timeout or a destroyed window, so this returns a nullable snapshot
// rather than throwing.
export const ShellServicesPtySerializeBufferInputSchema = z
  .object({
    ptyId: z.string(),
    opts: z
      .object({
        scrollbackRows: z.number().optional(),
        altScreenForcesZeroRows: z.boolean().optional()
      })
      .strict()
      .optional()
  })
  .strict()

export type ShellServicesPtySerializeBufferInput = z.output<
  typeof ShellServicesPtySerializeBufferInputSchema
>

const ShellServicesPtySerializedSnapshotSchema = z
  .object({
    data: z.string(),
    cols: z.number(),
    rows: z.number(),
    seq: z.number().optional(),
    lastTitle: z.string().optional()
  })
  .strict()

export const ShellServicesPtySerializeBufferOutputSchema = z
  .object({ snapshot: ShellServicesPtySerializedSnapshotSchema.nullable() })
  .strict()

export type ShellServicesPtySerializeBufferOutput = z.output<
  typeof ShellServicesPtySerializeBufferOutputSchema
>

export const shellServicesPtyContract = {
  serializeBuffer: oc
    .input(ShellServicesPtySerializeBufferInputSchema)
    .output(ShellServicesPtySerializeBufferOutputSchema)
} satisfies ContractRouter<Record<never, never>>
