import { oc, type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import type { RateLimitResumeSchedule } from './rate-limit-resume.js'
import {
  shellServicesBrowserContract,
  type ShellServicesBrowserTabCloseOutput,
  type ShellServicesBrowserTabCreateOutput,
  type ShellServicesBrowserTabSetProfileOutput
} from './shell-services-browser.js'
import { shellServicesPlatformContract } from './shell-services-platform.js'
import {
  shellServicesTerminalContract,
  type ShellServicesTerminalCloseTabOutput,
  type ShellServicesTerminalCreateOutput,
  type ShellServicesTerminalMountOutput,
  type ShellServicesTerminalRevealOutput
} from './shell-services-terminal.js'
import { shellServicesUIContract } from './shell-services-ui.js'

// Why: Phase 5 S1 spike — the runtime→shell reverse contract. Deliberately
// NOT a member of `runtimeContract` below: that router is bridged 1:1 to
// legacy `defineMethod` handlers at startup (desktop's
// main/runtime/rpc/orpc/router-bridge.ts throws if a contract path has no
// legacy counterpart), and reverse procedures have no legacy counterpart and
// never will. Keeping it a sibling export instead of a router member is what
// keeps that invariant intact while still tracking the shape in one place.
export const ShellServicesPingOutputSchema = z
  .object({
    pong: z.literal(true),
    respondedAtMs: z.number()
  })
  .strict()

export type ShellServicesPingOutput = z.output<typeof ShellServicesPingOutputSchema>

// Why: Phase 5 slice S3 — the runtime, having judged (settings/throttle/dedup)
// that a native prompt is warranted, asks the shell to drive the OS
// notification centre. `useSystemSound`/`suppressWhenFocused` arrive
// precomputed by the runtime (it already read the settings) so the shell only
// contributes what only it can know: window focus, OS Notification support,
// and the activeNotificationsById handle table.
export const ShellServicesNotificationsDisplayInputSchema = z
  .object({
    // Why: not used for gating (job1 already decided) — carried through only
    // so the shell's failure/authorization logs stay differentiated by source.
    source: z.enum(['agent-task-complete', 'terminal-bell', 'test']).optional(),
    notificationId: z.string().optional(),
    worktreeId: z.string().optional(),
    paneKey: z.string().optional(),
    title: z.string(),
    body: z.string(),
    useSystemSound: z.boolean(),
    suppressWhenFocused: z.boolean(),
    requireDisplayConfirmation: z.boolean().optional()
  })
  .strict()

export type ShellServicesNotificationsDisplayInput = z.output<
  typeof ShellServicesNotificationsDisplayInputSchema
>

export const ShellServicesNotificationsDisplayOutputSchema = z
  .object({
    delivered: z.boolean(),
    reason: z
      .enum(['suppressed-focus', 'not-supported', 'not-displayed', 'blocked-by-system'])
      .optional()
  })
  .strict()

export type ShellServicesNotificationsDisplayOutput = z.output<
  typeof ShellServicesNotificationsDisplayOutputSchema
>

export const ShellServicesNotificationsDismissInputSchema = z
  .object({ notificationIds: z.array(z.string()) })
  .strict()

export type ShellServicesNotificationsDismissInput = z.output<
  typeof ShellServicesNotificationsDismissInputSchema
>

export const ShellServicesNotificationsDismissOutputSchema = z
  .object({ dismissed: z.number() })
  .strict()

export type ShellServicesNotificationsDismissOutput = z.output<
  typeof ShellServicesNotificationsDismissOutputSchema
>

const shellServicesNotificationsContract = {
  display: oc
    .input(ShellServicesNotificationsDisplayInputSchema)
    .output(ShellServicesNotificationsDisplayOutputSchema),
  dismiss: oc
    .input(ShellServicesNotificationsDismissInputSchema)
    .output(ShellServicesNotificationsDismissOutputSchema)
} satisfies ContractRouter<Record<never, never>>

// Why: Phase 5 slice S4a — collapses the hand-rolled `randomUUID()` +
// `ipcMain.on('ui:mobileMarkdownResponse', …)` + 20s `setTimeout` relay
// (formerly `mobile-markdown-request-relay.ts`) into two procedures whose
// return value is the reply. The old single request channel carried a
// `{ operation: 'read' | 'save', … }` discriminated union down one pipe;
// `operation` is now just "which procedure to call" rather than a payload
// field. The renderer owns the editor draft/dirty state and save pipeline, so
// only it can serve either op — a real read/save failure (e.g. `conflict`,
// `file_too_large`, `tab_not_found`) is a domain outcome the caller must see
// verbatim, so the shell throws for those; only "no reverse link" maps to
// `ShellServicesUnavailableReason` below.
export const ShellServicesMobileMarkdownReadInputSchema = z
  .object({ worktreeId: z.string(), tabId: z.string() })
  .strict()

export type ShellServicesMobileMarkdownReadInput = z.output<
  typeof ShellServicesMobileMarkdownReadInputSchema
>

const ShellServicesMobileMarkdownReadOnlyReasonSchema = z.enum([
  'unsupported_preview',
  'unsupported_tab',
  'unsupported_untitled',
  'file_too_large'
])

export const ShellServicesMobileMarkdownReadOutputSchema = z
  .object({
    tabId: z.string(),
    filePath: z.string(),
    relativePath: z.string(),
    content: z.string(),
    isDirty: z.boolean(),
    version: z.string(),
    source: z.enum(['draft', 'file']),
    editable: z.boolean(),
    readOnlyReason: ShellServicesMobileMarkdownReadOnlyReasonSchema.optional()
  })
  .strict()

export type ShellServicesMobileMarkdownReadOutput = z.output<
  typeof ShellServicesMobileMarkdownReadOutputSchema
>

export const ShellServicesMobileMarkdownSaveInputSchema = z
  .object({
    worktreeId: z.string(),
    tabId: z.string(),
    baseVersion: z.string(),
    content: z.string()
  })
  .strict()

export type ShellServicesMobileMarkdownSaveInput = z.output<
  typeof ShellServicesMobileMarkdownSaveInputSchema
>

export const ShellServicesMobileMarkdownSaveOutputSchema = z
  .object({
    tabId: z.string(),
    version: z.string(),
    isDirty: z.literal(false),
    content: z.string()
  })
  .strict()

export type ShellServicesMobileMarkdownSaveOutput = z.output<
  typeof ShellServicesMobileMarkdownSaveOutputSchema
>

const shellServicesMobileMarkdownContract = {
  read: oc
    .input(ShellServicesMobileMarkdownReadInputSchema)
    .output(ShellServicesMobileMarkdownReadOutputSchema),
  save: oc
    .input(ShellServicesMobileMarkdownSaveInputSchema)
    .output(ShellServicesMobileMarkdownSaveOutputSchema)
} satisfies ContractRouter<Record<never, never>>

export type ShellServicesDispatchAcceptedOutput = { accepted: boolean }

const shellServicesRateLimitResumeContract = {
  dispatch: oc
    .input(type<RateLimitResumeSchedule>())
    .output(type<ShellServicesDispatchAcceptedOutput>())
} satisfies ContractRouter<Record<never, never>>

export const shellServicesContract = {
  ping: oc.output(ShellServicesPingOutputSchema),
  notifications: shellServicesNotificationsContract,
  platform: shellServicesPlatformContract,
  ui: shellServicesUIContract,
  terminal: shellServicesTerminalContract,
  mobileMarkdown: shellServicesMobileMarkdownContract,
  browser: shellServicesBrowserContract,
  rateLimitResume: shellServicesRateLimitResumeContract
} satisfies ContractRouter<Record<never, never>>

export type ShellServicesUnavailableReason = 'shell-unavailable'

// Why: mirrors the externalEditor.openRemoteSsh precedent — a structured
// unavailability result instead of throwing, so a caller on a headless host
// (no paired renderer, no reverse link) degrades instead of crashing.
export type ShellServicesPingResult =
  | ({ ok: true } & ShellServicesPingOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesNotificationsDisplayResult =
  | ({ ok: true } & ShellServicesNotificationsDisplayOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesNotificationsDismissResult =
  | ({ ok: true } & ShellServicesNotificationsDismissOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesTerminalCloseTabResult =
  | ({ ok: true } & ShellServicesTerminalCloseTabOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesTerminalCreateResult =
  | ({ ok: true } & ShellServicesTerminalCreateOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesTerminalMountResult =
  | ({ ok: true } & ShellServicesTerminalMountOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesTerminalRevealResult =
  | ({ ok: true } & ShellServicesTerminalRevealOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesMobileMarkdownReadResult =
  | ({ ok: true } & ShellServicesMobileMarkdownReadOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesMobileMarkdownSaveResult =
  | ({ ok: true } & ShellServicesMobileMarkdownSaveOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesBrowserTabCreateResult =
  | ({ ok: true } & ShellServicesBrowserTabCreateOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesBrowserTabSetProfileResult =
  | ({ ok: true } & ShellServicesBrowserTabSetProfileOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesBrowserTabCloseResult =
  | ({ ok: true } & ShellServicesBrowserTabCloseOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }

export type ShellServicesRateLimitResumeDispatchResult =
  | ({ ok: true } & ShellServicesDispatchAcceptedOutput)
  | { ok: false; reason: ShellServicesUnavailableReason }
