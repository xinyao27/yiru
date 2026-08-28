import type { CodexManagedAccount } from '@yiru/runtime-protocol/workbench/types'

import { CodexRuntimeHomeBase } from './runtime-home-base'
import type {
  CodexAuthIdentity,
  CodexSystemDefaultSnapshot,
  CodexRuntimeLogoutMarker,
  CodexRuntimeLogoutMarkerStatus,
  CodexReadBackResult,
  CodexReadBackMatch
} from './runtime-home-foundation'
import type { CodexAccountSelectionTarget } from './runtime-selection'

export abstract class CodexRuntimeHomeContract1 extends CodexRuntimeHomeBase {
  protected abstract initializeLastSyncedState(): void
  abstract prepareForCodexLaunch(
    target?: CodexAccountSelectionTarget,
    launchEnv?: NodeJS.ProcessEnv
  ): string | null
  protected abstract getSelfContainedManagedHostAccount(): CodexManagedAccount | null
  protected abstract getManagedHostAccountHomesForSessionDiscovery(): string[]
  protected abstract prepareSelfContainedManagedHomeForLaunch(
    account: CodexManagedAccount
  ): string | null
  protected abstract syncSelfContainedManagedSelection(account: CodexManagedAccount): void
  protected abstract getTrustedSelfContainedManagedHomePath(
    account: CodexManagedAccount
  ): string | null
  protected abstract clearSelfContainedManagedSelection(account: CodexManagedAccount): void
  protected abstract invalidateBackfillAfterManagedSystemDefaultLaunch(
    launchEnv?: NodeJS.ProcessEnv
  ): void
  protected abstract startWslSessionBridgeForLaunch(
    target: CodexAccountSelectionTarget,
    runtimeHomePath: string | null
  ): void
  abstract getHostCodexHomePathsForSessionDiscovery(): string[]
  abstract setRealHomeLaneGate(gate: () => boolean): void
  abstract isHostSystemDefaultRealHomeSelected(launchEnv?: NodeJS.ProcessEnv): boolean
  abstract isHostSystemDefaultRealHome(launchEnv?: NodeJS.ProcessEnv): boolean
  abstract syncActiveWslSelectionsBeforeRestart(): void
  protected abstract getWslSystemCodexHomePath(target: CodexAccountSelectionTarget): string | null
  protected abstract syncWslConfigAndGlobalInstructionsForLaunch(
    target: CodexAccountSelectionTarget,
    runtimeHomePath: string | null
  ): void
  abstract prepareForRateLimitFetch(target?: CodexAccountSelectionTarget): string | null
  abstract syncForCurrentSelection(target?: CodexAccountSelectionTarget): void
  protected abstract recoverRefreshForMissingActiveAccount(
    account: CodexManagedAccount
  ): CodexReadBackResult
  abstract clearLastWrittenAuthJson(accountId?: string | null): void
  protected abstract readBackRefreshedTokens(options: {
    updateLastWrittenAuthJson: boolean
  }): CodexReadBackResult
  protected abstract readBackRefreshedTokensFromPath(
    runtimeAuthPath: string,
    options: {
      updateLastWrittenAuthJson: boolean
      lastWrittenAuthJson?: string | null
      setLastWrittenAuthJson?: (contents: string) => void
      expectedAccountId?: string
    }
  ): CodexReadBackResult
  protected abstract readBackRefreshedTokensForAccount(
    account: CodexManagedAccount,
    options: { updateLastWrittenAuthJson: boolean }
  ): CodexReadBackResult
  protected abstract safeSyncForCurrentSelection(): void
  protected abstract getActiveAccount(
    accounts: CodexManagedAccount[],
    activeAccountId: string | null
  ): CodexManagedAccount | null
  protected abstract getWslManagedHomePath(account: CodexManagedAccount | null): string | null
  protected abstract getPreparedWslRateLimitHomePath(
    target: CodexAccountSelectionTarget
  ): string | null
  protected abstract syncWslRuntimeForCurrentSelection(
    target: CodexAccountSelectionTarget
  ): string | null
  protected abstract getWslRuntimeHomePath(distro: string): string | null
  protected abstract safeReadBackActiveWslAccountBeforeRestart(
    account: CodexManagedAccount,
    selectedDistroKey: string
  ): void
  protected abstract readBackActiveWslAccountBeforeRestart(
    account: CodexManagedAccount,
    selectedDistroKey: string
  ): void
  protected abstract safeMigrateLegacyWslActiveHomePointer(
    distro: string,
    runtimeHomePath: string
  ): void
  protected abstract migrateLegacyWslActiveHomePointer(
    distro: string,
    runtimeHomePath: string
  ): void
  protected abstract dirnameLinuxPath(value: string): string
  protected abstract quoteBashString(value: string): string
  protected abstract joinWslPath(basePath: string, ...segments: string[]): string
  protected abstract resolveWslDefaultTarget(
    target: CodexAccountSelectionTarget
  ): CodexAccountSelectionTarget
  protected abstract getWslSystemCodexAuthPath(target: CodexAccountSelectionTarget): string | null
  protected abstract seedWslRuntimeHome(
    runtimeHomePath: string,
    activeAccount: CodexManagedAccount | null,
    distro: string
  ): void
  protected abstract findManagedAccountForRuntimeAuth(
    runtimeAuthContents: string,
    expectedAccountId?: string
  ): CodexReadBackMatch
  protected abstract runtimeAuthMatchesAccount(
    runtimeAuthContents: string,
    activeAccount: CodexManagedAccount,
    managedAuthContents: string
  ): boolean
  protected abstract runtimeAuthMatchesSystemDefaultIdentity(
    runtimeAuthContents: string,
    systemDefaultAuthContents: string
  ): boolean
  protected abstract runtimeAuthIsFresher(
    runtimeAuthContents: string,
    managedAuthContents: string
  ): boolean
  protected abstract identityFieldMatches(
    selectedField: string | null,
    runtimeField: string | null
  ): boolean
  protected abstract firstNonNull(...values: (string | null | undefined)[]): string | null
  protected abstract readIdentityFromAuthContents(contents: string): CodexAuthIdentity | null
  protected abstract readFreshnessFromAuthContents(contents: string): number | null
  protected abstract parseJwtPayload(token: string): Record<string, unknown> | null
  protected abstract readRecordClaim(
    value: Record<string, unknown> | null,
    key: string
  ): Record<string, unknown> | null
  protected abstract readStringClaim(
    value: Record<string, unknown> | null,
    key: string
  ): string | null
  protected abstract readNumberClaim(
    value: Record<string, unknown> | null,
    key: string
  ): number | null
  protected abstract normalizeField(value: string | null | undefined): string | null
  protected abstract safeMigrateLegacySharedAuth(): void
  protected abstract safeMigrateLegacyManagedState(): void
  protected abstract safeMigrateLegacyActiveHomePointer(): void
  protected abstract getRuntimeHomePath(): string
  protected abstract getRuntimeAuthPath(): string
  protected abstract getSystemDefaultSnapshotPath(): string
  protected abstract getRuntimeLogoutMarkerPath(): string
  protected abstract getRuntimeMetadataDir(): string
  protected abstract getLegacyHostActiveHomePath(): string
  protected abstract getMigrationMarkerPath(): string
  protected abstract getMigrationDiagnosticsPath(): string
  protected abstract getManagedAccountsRoot(): string
  protected abstract repointLegacyActiveHomePointer(
    activeHomePath: string,
    runtimeHomePath: string
  ): void
  protected abstract activeHomeAlreadyPointsToRuntimeHome(
    activeHomePath: string,
    runtimeHomePath: string
  ): boolean
  protected abstract linkTargetsMatch(
    linkTarget: string,
    linkPath: string,
    expectedTargetPath: string
  ): boolean
  protected abstract legacyActiveHomeLinkIsReplaceable(activeHomePath: string): boolean
  protected abstract legacyActiveHomePathExists(activeHomePath: string): boolean
  protected abstract removeLegacyActiveHomeLinkIfOwned(activeHomePath: string): void
  protected abstract isWindowsReadableLink(targetPath: string): boolean
  protected abstract migrateLegacyManagedStateIfNeeded(): void
  protected abstract getLegacyManagedHomes(): string[]
  protected abstract migrateLegacyHistory(managedHomePath: string): void
  protected abstract migrateLegacySessions(managedHomePath: string, accountId: string): void
  protected abstract listFilesRecursively(rootPath: string): string[]
  protected abstract appendListedFiles(target: string[], source: readonly string[]): void
  protected abstract getPreservedLegacySessionPath(
    runtimeFilePath: string,
    accountId: string
  ): string
  protected abstract appendMigrationDiagnostic(record: Record<string, string>): void
  protected abstract captureSystemDefaultSnapshot(options: { force: boolean }): void
  protected abstract syncRuntimeAuthWithSystemDefault(): void
  protected abstract restoreSystemDefaultSnapshot(options: { detectExternalLogin: boolean }): void
  protected abstract writeSystemDefaultAuth(contents: string): void
  protected abstract clearRuntimeAuthAfterSystemDefaultLogout(runtimeAuthPath: string): void
  protected abstract readSystemDefaultAuth(): string | null
  protected abstract writeRuntimeAuth(contents: string): void
  protected abstract writeRuntimeAuthAtPath(authPath: string, contents: string): void
  protected abstract fileContentsEqual(targetPath: string, contents: string): boolean
  protected abstract ensureOwnerOnlyMode(targetPath: string): void
  protected abstract getRuntimeLogoutMarkerStatus(): CodexRuntimeLogoutMarkerStatus
  protected abstract persistRuntimeLogoutMarker(systemDefaultAuthJson?: string | null): void
  protected abstract readRuntimeLogoutMarker(): CodexRuntimeLogoutMarker | null
  protected abstract clearRuntimeLogoutMarker(): void
  protected abstract readSystemDefaultSnapshot(
    snapshotPath: string
  ): CodexSystemDefaultSnapshot | null
  abstract clearSystemDefaultSnapshot(): void
}
