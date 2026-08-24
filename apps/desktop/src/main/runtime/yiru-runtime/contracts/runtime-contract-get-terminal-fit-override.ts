import type {
  ApplyLayoutResult,
  DriverState,
  PtyLayoutState,
  PtyLayoutTarget
} from '../model/worktree-resolution'
import { RuntimeContractRecordRecentPtyOutputForPathProvenance } from './runtime-contract-record-recent-pty-output-for-path-provenance'

export abstract class RuntimeContractGetTerminalFitOverride extends RuntimeContractRecordRecentPtyOutputForPathProvenance {
  abstract getTerminalFitOverride(ptyId: string)

  abstract getAllTerminalFitOverrides(): Map<
    string,
    { mode: 'mobile-fit' | 'remote-desktop-fit'; cols: number; rows: number }
  >

  abstract getAllTerminalDrivers(): Map<string, DriverState>

  abstract onClientDisconnected(clientId: string): void

  abstract onPtyExit(ptyId: string, exitCode: number): void

  abstract getDriver(ptyId: string): DriverState

  protected abstract setDriver(ptyId: string, next: DriverState): void

  abstract isPtyResizeDrivenRemotely(ptyId: string): boolean

  abstract isRemoteDesktopResizeDriven(ptyId: string): boolean

  abstract isRemoteDesktopViewerOwner(ptyId: string, subscriptionKey: string): boolean

  abstract getRemoteDesktopFitHold(
    ptyId: string,
    subscriptionKey: string
  ): { mode: 'remote-desktop-fit' | 'desktop-fit'; cols: number; rows: number }

  protected abstract hasRemoteDesktopViewers(ptyId: string): boolean

  protected abstract activeRemoteDesktopViewport(
    ptyId: string
  ): { cols: number; rows: number } | null

  protected abstract resolveRemoteDesktopHostReclaimTarget(ptyId: string): {
    cols: number
    rows: number
  }

  protected abstract ensureRemoteDesktopHostReclaimTarget(ptyId: string): void

  abstract recordRemoteDesktopHostReclaimTarget(ptyId: string, cols: number, rows: number): void

  protected abstract hasRemoteDesktopLayoutState(ptyId: string): boolean

  protected abstract bumpRemoteDesktopViewerRevision(ptyId: string): number

  abstract applyRemoteDesktopLayout(ptyId: string): Promise<boolean>

  abstract updateRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string,
    clientId: string,
    cols: number,
    rows: number,
    claim?: boolean
  ): Promise<boolean>

  abstract claimRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean>

  abstract claimRemoteDesktopHost(ptyId: string, cols: number, rows: number): Promise<boolean>

  abstract unregisterRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean>

  abstract unregisterRemoteDesktopViewers(
    ptyId: string,
    subscriptionKeys: Iterable<string>
  ): Promise<boolean>

  abstract refreshRemoteDesktopViewer(
    ptyId: string,
    clientId: string,
    cols: number,
    rows: number,
    claim?: boolean
  ): Promise<boolean>

  abstract updateDesktopViewport(
    ptyId: string,
    viewport: { cols: number; rows: number }
  ): Promise<boolean>

  abstract markMobileActor(ptyId: string, clientId: string): void

  abstract beginMobileInputFloor(
    ptyId: string,
    clientId: string
  ): { commit: () => Promise<void>; rollback: () => void } | null

  abstract mobileTookFloor(
    ptyId: string,
    clientId: string,
    previousFloor?: DriverState,
    isCurrent?: () => boolean
  ): Promise<void>

  abstract updateMobileViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): Promise<{ updated: boolean; applied: boolean }>

  abstract reclaimTerminalForDesktop(ptyId: string): Promise<boolean>

  protected abstract releaseDesktopTakeBack(ptyId: string): void

  protected abstract getAutoRestoreFitMs(): number | null

  abstract cancelAllPendingFitRestoreTimers(): void

  abstract getMobileAutoRestoreFitMs(): number | null

  abstract setMobileAutoRestoreFitMs(ms: number | null): number | null

  protected abstract pickMostRecentActor(
    subscribers: Iterable<{ clientId: string; lastActedAt: number }>
  ): { clientId: string; lastActedAt: number } | null

  abstract getLayout(ptyId: string): PtyLayoutState | null

  protected abstract resolveDesktopRestoreTarget(ptyId: string): { cols: number; rows: number }

  protected abstract enqueueLayout(
    ptyId: string,
    target: PtyLayoutTarget,
    allowInitial?: boolean
  ): Promise<ApplyLayoutResult>

  abstract setMobileDisplayMode(ptyId: string, mode: 'auto' | 'desktop'): void

  abstract getMobileDisplayMode(ptyId: string): 'auto' | 'desktop'

  abstract isMobileSubscriberActive(ptyId: string): boolean

  abstract updateMobileSubscriberViewport(
    ptyId: string,
    clientId: string,
    viewport: { cols: number; rows: number }
  ): void
}
