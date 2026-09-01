import type { AgentStatusIpcPayload } from '@yiru/runtime-protocol/model/agent'
import type { RuntimeCapability } from '@yiru/runtime-protocol/protocol-version'
import type { RuntimeSyncedTab } from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  WarpThemeImportPreview,
  WarpThemeImportSource
} from '@yiru/runtime-protocol/workbench/terminal/custom-themes'
import type { TerminalSideEffectBatch } from '@yiru/runtime-protocol/workbench/terminal/side-effect-facts'
import type { GhosttyImportPreview } from '@yiru/runtime-protocol/workbench/types'
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import type { RuntimeHostProcessMetricsProvider } from '~main/memory/collector'
import type { OrchestrationEnvironmentTransport } from '~main/runtime/orchestration/environment-transport'
import type { RuntimeProviderUsage } from '~main/runtime/provider-usage/capabilities'
import type { TerminalSessionAuthority } from '~main/runtime/terminal-session-authority/terminal-session-authority'

import type { RuntimeStore } from '../model/runtime-store'
import type {
  RuntimeHeadlessTerminal,
  RuntimeTerminalAgentStatusEvent
} from '../model/terminal-observation'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type { MessageWaiter, TerminalHandleRecord, TerminalWaiter } from '../model/terminal-startup'
import { RuntimeContractIsRecognizedForegroundAgentProcess } from './runtime-contract-is-recognized-foreground-agent-process'

export abstract class RuntimeCompositionContract extends RuntimeContractIsRecognizedForegroundAgentProcess {
  protected abstract readonly store: RuntimeStore | null

  protected abstract readonly terminalSessions: TerminalSessionAuthority<
    RuntimeSyncedTab,
    RuntimeLeafRecord,
    RuntimePtyWorktreeRecord,
    TerminalHandleRecord,
    RuntimeHeadlessTerminal,
    TerminalWaiter,
    MessageWaiter
  >

  protected abstract readonly orchestrationEnvironmentTransport: OrchestrationEnvironmentTransport | null

  protected abstract readonly getLocalProviderFn: (() => IPtyProvider) | null

  protected abstract readonly getSshProviderFn:
    | ((connectionId: string) => IPtyProvider | undefined)
    | null

  protected abstract readonly onPtyStopped: ((ptyId: string) => void) | null

  protected abstract readonly onTerminalAgentStatus:
    | ((event: RuntimeTerminalAgentStatusEvent) => void)
    | null

  protected abstract readonly onTerminalSideEffects:
    | ((batch: TerminalSideEffectBatch) => void)
    | null

  protected abstract readonly getAgentStatusSnapshotFn: (() => AgentStatusIpcPayload[]) | null

  protected abstract readonly buildAgentHookPtyEnv: (() => Record<string, string>) | null

  protected abstract readonly getHostProcessMetricsFn: RuntimeHostProcessMetricsProvider | undefined

  protected abstract readonly disabledCapabilities: ReadonlySet<RuntimeCapability>

  protected abstract readonly previewGhosttyImportForClientFn:
    | (() => Promise<GhosttyImportPreview>)
    | null

  protected abstract readonly previewWarpThemeImportForClientFn:
    | ((source: WarpThemeImportSource) => Promise<WarpThemeImportPreview>)
    | null

  abstract readonly providerUsage: RuntimeProviderUsage
  // Why: notifications.report's job1 (throttle/dedup) moved here from the
  // legacy notifications:dispatch ipcMain closure — Phase 5 slice S3. Two
  // independent trackers because the desktop-notification cooldown and the
  // mobile-push cooldown key/reserve independently (a suppressed desktop
  // notification must not block the mobile push, and vice versa).
}
