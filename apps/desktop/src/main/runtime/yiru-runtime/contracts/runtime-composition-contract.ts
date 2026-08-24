import type { RuntimeCapability } from '@yiru/runtime-protocol/capabilities'
import type { AgentStatusIpcPayload } from '@yiru/workbench-model/agent'
import type { RuntimeHostProcessMetricsProvider } from '~main/memory/collector'
import type { IPtyProvider } from '~main/providers/types'
import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'
import type { OrchestrationEnvironmentTransport } from '~main/runtime/orchestration/environment-transport'
import type { RuntimeProviderUsage } from '~main/runtime/provider-usage/capabilities'
import type { TerminalSessionAuthority } from '~main/runtime/terminal-session-authority/terminal-session-authority'
import type { RuntimeBrowserCommands } from '~main/runtime/yiru-runtime-browser'
import type { RuntimeDesktopWindowStatus } from '~shared/runtime-types'
import type { RuntimeSyncedTab } from '~shared/runtime-types'
import type { WarpThemeImportPreview, WarpThemeImportSource } from '~shared/terminal/custom-themes'
import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'
import type { GhosttyImportPreview } from '~shared/types'

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

  protected abstract readonly getDesktopWindowStatusFn: () => RuntimeDesktopWindowStatus

  protected abstract readonly getWindowByIdFn: (windowId: number) => RuntimeWindowTarget | null

  protected abstract readonly getHostProcessMetricsFn: RuntimeHostProcessMetricsProvider | undefined

  protected abstract readonly browserCommandsValue: RuntimeBrowserCommands

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
