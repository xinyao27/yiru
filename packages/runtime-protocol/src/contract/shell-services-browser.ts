import { oc, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

// Why: Phase 5 slice S6 (切片 47) — the browser tab trio's reverse leg,
// collapsing browser-tab creation/profile-switch/close's hand-rolled
// `randomUUID()` + `ipcMain.on(...)` + 10s `setTimeout` triplet
// (`browser:requestTabCreate`/`tabCreateReply`,
// `browser:requestTabSetProfile`/`tabSetProfileReply`,
// `browser:requestTabClose`/`tabCloseReply`) into three procedures whose
// return value is the reply, same shape as S4a/S4b. Same non-collapsing rule:
// a rejected pinned-tab confirmation or a "tab not found"/"no active
// worktree" outcome is the caller's real answer and must propagate as a
// thrown error; only "no reverse link" maps to `ShellServicesUnavailableReason`
// below.
export const ShellServicesBrowserTabCreateInputSchema = z
  .object({
    url: z.string(),
    worktreeId: z.string().optional(),
    sessionProfileId: z.string().nullable().optional(),
    sessionPartition: z.string().optional(),
    activate: z.boolean().optional()
  })
  .strict()

export type ShellServicesBrowserTabCreateInput = z.output<
  typeof ShellServicesBrowserTabCreateInputSchema
>

export const ShellServicesBrowserTabCreateOutputSchema = z
  .object({ browserPageId: z.string() })
  .strict()

export type ShellServicesBrowserTabCreateOutput = z.output<
  typeof ShellServicesBrowserTabCreateOutputSchema
>

export const ShellServicesBrowserTabSetProfileInputSchema = z
  .object({
    browserPageId: z.string(),
    profileId: z.string(),
    sessionPartition: z.string().optional()
  })
  .strict()

export type ShellServicesBrowserTabSetProfileInput = z.output<
  typeof ShellServicesBrowserTabSetProfileInputSchema
>

// Why: the old reply carried only `{ requestId, error? }` — no success data,
// since the caller (main) already knows profileId/profileLabel from its own
// registry lookup. `updated` is a literal ack, not a real field, kept instead
// of an empty object because `{ ok: true, ...output }`'s spread in
// shell-services-reverse-link.ts needs at least one property to widen past
// `Record<string, never>`.
export const ShellServicesBrowserTabSetProfileOutputSchema = z
  .object({ updated: z.literal(true) })
  .strict()

export type ShellServicesBrowserTabSetProfileOutput = z.output<
  typeof ShellServicesBrowserTabSetProfileOutputSchema
>

// Why: the renderer's pinned-tab close confirmation can await an unbounded
// human decision before replying — see requestShellBrowserTabClose in
// shell-services-reverse-link.ts for why this keeps the pre-existing 10s
// budget rather than inventing a two-phase accept/report shape.
export const ShellServicesBrowserTabCloseInputSchema = z
  .object({ tabId: z.string().nullable(), worktreeId: z.string().optional() })
  .strict()

export type ShellServicesBrowserTabCloseInput = z.output<
  typeof ShellServicesBrowserTabCloseInputSchema
>

export const ShellServicesBrowserTabCloseOutputSchema = z
  .object({ closed: z.literal(true) })
  .strict()

export type ShellServicesBrowserTabCloseOutput = z.output<
  typeof ShellServicesBrowserTabCloseOutputSchema
>

export const shellServicesBrowserContract = {
  tabCreate: oc
    .input(ShellServicesBrowserTabCreateInputSchema)
    .output(ShellServicesBrowserTabCreateOutputSchema),
  tabSetProfile: oc
    .input(ShellServicesBrowserTabSetProfileInputSchema)
    .output(ShellServicesBrowserTabSetProfileOutputSchema),
  tabClose: oc
    .input(ShellServicesBrowserTabCloseInputSchema)
    .output(ShellServicesBrowserTabCloseOutputSchema)
} satisfies ContractRouter<Record<never, never>>
