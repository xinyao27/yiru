import { oc, type ContractRouter } from '@orpc/contract'
import type { TuiAgent } from '@yiru/workbench-model/agent'
import { z } from 'zod'

import { isRuntimeTuiAgent, SleepingAgentLaunchConfigSchema } from './input-schema.js'

// Why: Phase 5 slice S4b — collapses the hand-rolled `requestId` +
// `ipcMain.once('ui:terminalTabCloseResponse', …)` + 20s `setTimeout` relay
// (formerly `terminal-tab-close-request-relay.ts`) into one procedure whose
// return value is the reply. A rejected pin confirmation ('terminal_tab_pinned')
// or a mid-close persistence failure is a real outcome the caller must
// distinguish from an unreachable shell, so the shell throws for those instead
// of encoding them into the output — only "no reverse link" maps to
// `ShellServicesUnavailableReason` below.
export const ShellServicesTerminalCloseTabInputSchema = z.object({ tabId: z.string() }).strict()

export type ShellServicesTerminalCloseTabInput = z.output<
  typeof ShellServicesTerminalCloseTabInputSchema
>

export const ShellServicesTerminalCloseTabOutputSchema = z
  .object({ closed: z.literal(true) })
  .strict()

export type ShellServicesTerminalCloseTabOutput = z.output<
  typeof ShellServicesTerminalCloseTabOutputSchema
>

// Why: Phase 5 slice S4b (terminal creation cluster) — collapses the
// `onRequestTerminalCreate`/`replyTerminalCreate` pair (`terminal:requestTabCreate`
// channel) into one procedure. This is the renderer-owns-the-PTY-spawn half of
// terminal creation: the renderer mints a fresh tab and queues its own PTY
// startup command, unlike `reveal` below which adopts a PTY main already
// spawned. `createTerminal()`'s foreground path and `runCreateMobileSessionTerminal`
// both already funnel into the renderer's single `onRequestTerminalCreate`
// handler, so one wider input (afterTabId/targetGroupId/source are mobile-only)
// rather than a second procedure. A thrown error here (e.g. "No active
// worktree", a remote-runtime-active guard) is the caller's real answer, not a
// shell-unavailable degrade — same non-collapsing rule as closeTab above.
export const ShellServicesTerminalCreateInputSchema = z
  .object({
    worktreeId: z.string().optional(),
    afterTabId: z.string().optional(),
    targetGroupId: z.string().optional(),
    command: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    envToDelete: z.array(z.string()).optional(),
    launchConfig: SleepingAgentLaunchConfigSchema,
    launchToken: z.string().optional(),
    launchAgent: z
      .custom<TuiAgent>(isRuntimeTuiAgent, { message: 'Unknown launch agent' })
      .optional(),
    viewMode: z.enum(['terminal', 'chat']).optional(),
    startupCommandDelivery: z.enum(['fast', 'shell-ready']).optional(),
    title: z.string().optional(),
    activate: z.boolean().optional(),
    presentation: z.enum(['background', 'focused']).optional(),
    // Why: only the host-owned runtime-session bridge (mobile) may bypass the
    // renderer's active-remote-runtime local-terminal guard; desktop-originated
    // creates must omit this.
    source: z.literal('runtime-session').optional()
  })
  .strict()

export type ShellServicesTerminalCreateInput = z.output<
  typeof ShellServicesTerminalCreateInputSchema
>

export const ShellServicesTerminalCreateOutputSchema = z
  .object({ tabId: z.string(), title: z.string() })
  .strict()

export type ShellServicesTerminalCreateOutput = z.output<
  typeof ShellServicesTerminalCreateOutputSchema
>

// Why: Phase 5 slice S4b (terminal creation cluster) — collapses the
// `onCreateTerminal`/`replyTerminalCreate` pair (`ui:createTerminal` channel,
// requestId-bearing branch only — the fire-and-forget branch had zero call
// sites and was deleted) into one procedure. This is `notifier.revealTerminalSession`'s
// leg: main has already spawned the PTY (`ptyId`) and asks the renderer to
// adopt or create the tab that surfaces it, materially different from
// `create` above where the renderer owns the spawn.
const SHELL_SERVICES_TERMINAL_PANE_SPLIT_SOURCES = [
  'contextual_tour',
  'keyboard',
  'context_menu',
  'command',
  'unknown'
] as const

export const ShellServicesTerminalRevealInputSchema = z
  .object({
    worktreeId: z.string(),
    ptyId: z.string(),
    title: z.string().nullable().optional(),
    cwd: z.string().optional(),
    launchConfig: SleepingAgentLaunchConfigSchema,
    launchToken: z.string().optional(),
    launchAgent: z
      .custom<TuiAgent>(isRuntimeTuiAgent, { message: 'Unknown launch agent' })
      .optional(),
    viewMode: z.enum(['terminal', 'chat']).optional(),
    isFriday: z.boolean().optional(),
    activate: z.boolean().optional(),
    presentation: z.enum(['background', 'focused']).optional(),
    tabId: z.string().optional(),
    leafId: z.string().optional(),
    splitFromLeafId: z.string().optional(),
    splitDirection: z.enum(['horizontal', 'vertical']).optional(),
    splitTelemetrySource: z.enum(SHELL_SERVICES_TERMINAL_PANE_SPLIT_SOURCES).optional()
  })
  .strict()

export type ShellServicesTerminalRevealInput = z.output<
  typeof ShellServicesTerminalRevealInputSchema
>

export const ShellServicesTerminalRevealOutputSchema = z
  .object({ tabId: z.string(), title: z.string().nullable().optional() })
  .strict()

export type ShellServicesTerminalRevealOutput = z.output<
  typeof ShellServicesTerminalRevealOutputSchema
>

// Why: a mobile terminal subscription may need the renderer to mount a saved
// tab in the background before its PTY or xterm serializer exists. This is a
// runtime-to-shell control request; terminal bytes stay on their dedicated
// multiplex/NDJSON transports.
export const ShellServicesTerminalMountInputSchema = z
  .object({
    worktreeId: z.string(),
    tabId: z.string().optional(),
    ptyId: z.string().optional()
  })
  .strict()

export type ShellServicesTerminalMountInput = z.output<typeof ShellServicesTerminalMountInputSchema>

export const ShellServicesTerminalMountOutputSchema = z.object({ accepted: z.boolean() }).strict()

export type ShellServicesTerminalMountOutput = z.output<
  typeof ShellServicesTerminalMountOutputSchema
>

export const shellServicesTerminalContract = {
  closeTab: oc
    .input(ShellServicesTerminalCloseTabInputSchema)
    .output(ShellServicesTerminalCloseTabOutputSchema),
  create: oc
    .input(ShellServicesTerminalCreateInputSchema)
    .output(ShellServicesTerminalCreateOutputSchema),
  mount: oc
    .input(ShellServicesTerminalMountInputSchema)
    .output(ShellServicesTerminalMountOutputSchema),
  reveal: oc
    .input(ShellServicesTerminalRevealInputSchema)
    .output(ShellServicesTerminalRevealOutputSchema)
} satisfies ContractRouter<Record<never, never>>
