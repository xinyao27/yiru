import type { ClaudeManagedAccount } from '@yiru/runtime-protocol/workbench/types'
import type { AiVaultSessionRuntimeTarget } from '~main/ai-vault/session/root-configuration'
import type { Store } from '~main/persistence/store'

import { ClaudeRuntimeAuthBase } from './runtime-auth-base'
import type {
  ClaudeRuntimeAuthPreparation,
  ClaudeSystemDefaultSnapshot,
  ClaudeAuthIdentity,
  ClaudeReadBackResult,
  ClaudeReadBackMatch,
  ClaudeKeychainReadResult,
  ClaudeKeychainSnapshotValue,
  ClaudeRefreshTokenComparison,
  ClaudeRuntimeCredentialCandidate
} from './runtime-auth-foundation'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'

export abstract class ClaudeRuntimeAuthContract extends ClaudeRuntimeAuthBase {
  abstract prepareForClaudeLaunch(
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRuntimeAuthPreparation>
  abstract prepareForRateLimitFetch(
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRuntimeAuthPreparation>
  abstract syncForCurrentSelection(target?: ClaudeAccountSelectionTarget): Promise<void>
  abstract forceMaterializeCurrentSelectionForRollback(): Promise<void>
  abstract getRuntimeConfigDir(): string
  abstract resolveSessionProjectRoots(target: AiVaultSessionRuntimeTarget): Promise<string[]>
  protected abstract initializeLastSyncedState(): void
  protected abstract safeSyncForCurrentSelection(): Promise<void>
  protected abstract doSyncForCurrentSelection(target?: ClaudeAccountSelectionTarget): Promise<void>
  abstract clearLastWrittenCredentialsJson(accountId?: string | null): void
  protected abstract readBackRefreshedTokens(
    baselineCredentialsJson: string,
    options: { updateLastWrittenCredentialsJson: boolean }
  ): Promise<ClaudeReadBackResult>
  protected abstract readRuntimeCredentialCandidatesForReadBack(
    baselineCredentialsJson: string
  ): Promise<ClaudeRuntimeCredentialCandidate[]>
  protected abstract getPreparation(
    target?: ClaudeAccountSelectionTarget
  ): ClaudeRuntimeAuthPreparation
  protected abstract getActiveAccount(
    accounts: ClaudeManagedAccount[],
    activeAccountId: string | null
  ): ClaudeManagedAccount | null
  protected abstract getDefaultAccountSelectionTarget(
    settings?: ReturnType<Store['getSettings']>
  ): ClaudeAccountSelectionTarget
  protected abstract resolveWslDefaultTarget(
    target?: ClaudeAccountSelectionTarget
  ): ClaudeAccountSelectionTarget
  protected abstract findManagedAccountForRuntimeCredentials(
    runtimeCredentialsJson: string,
    runtimeOauthAccount: unknown
  ): Promise<ClaudeReadBackMatch>
  protected abstract runtimeCredentialsMatchAccount(
    runtimeCredentialsJson: string,
    runtimeOauthAccount: unknown,
    account: ClaudeManagedAccount,
    managedCredentialsJson: string,
    managedOauthAccount: unknown
  ): 'match' | 'mismatch' | 'unverifiable'
  protected abstract liveRuntimeCredentialsCanUpdateActiveAccount(
    runtimeCredentialsJson: string,
    account: ClaudeManagedAccount,
    managedCredentialsJson: string,
    managedOauthAccount: unknown
  ): boolean
  protected abstract readIdentityFromCredentials(credentialsJson: string): ClaudeAuthIdentity | null
  protected abstract isValidCredentialsJsonObject(credentialsJson: string): boolean
  protected abstract runtimeCredentialsAreFresher(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): boolean
  protected abstract runtimeCredentialsAreOlder(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): boolean
  protected abstract chooseFreshestReadBackCandidate(
    candidates: {
      credentialsJson: string
      match: Extract<ClaudeReadBackMatch, { kind: 'matched' }>
    }[]
  ): {
    credentialsJson: string
    match: Extract<ClaudeReadBackMatch, { kind: 'matched' }>
  }
  protected abstract readFreshnessFromCredentials(credentialsJson: string): number | null
  protected abstract compareRefreshTokens(
    runtimeCredentialsJson: string,
    managedCredentialsJson: string
  ): ClaudeRefreshTokenComparison
  protected abstract readRefreshTokenFromCredentials(credentialsJson: string): string | null
  protected abstract readIdentityFromOauthAccount(oauthAccount: unknown): ClaudeAuthIdentity
  protected abstract asRecord(value: unknown): Record<string, unknown> | null
  protected abstract readString(value: Record<string, unknown> | null, key: string): string | null
  protected abstract readNumber(value: Record<string, unknown> | null, key: string): number | null
  protected abstract normalizeField(value: string | null | undefined): string | null
  protected abstract readManagedCredentials(account: ClaudeManagedAccount): Promise<string | null>
  protected abstract writeManagedCredentials(
    account: ClaudeManagedAccount,
    credentialsJson: string
  ): Promise<void>
  protected abstract refreshManagedAccountTokenIfNeeded(
    account: ClaudeManagedAccount,
    credentialsJson: string
  ): Promise<string | null>
  protected abstract readManagedOauthAccount(account: ClaudeManagedAccount): unknown
  protected abstract getOwnedManagedAuthPath(account: ClaudeManagedAccount): string | null
  protected abstract captureSystemDefaultSnapshotForManagedEntry(
    runtimeCredentialsJson: string | null,
    managedCredentialsJson: string
  ): Promise<void>
  protected abstract captureSystemDefaultSnapshot(options: {
    force: boolean
    credentialsJsonOverride?: string | null
    previousSnapshot?: ClaudeSystemDefaultSnapshot | null
    managedCredentialsJson?: string
  }): Promise<void>
  protected abstract restoreSystemDefaultSnapshot(
    ownedCredentialsJson?: string | null,
    ownedOauthAccount?: unknown
  ): Promise<void>
  protected abstract getOwnedRuntimeOauthBaseline(
    ownedOauthAccount: unknown,
    hasCredentialSurfaceOwnership: boolean
  ): unknown
  protected abstract readSystemDefaultSnapshot(
    snapshotPath: string
  ): ClaudeSystemDefaultSnapshot | null
  protected abstract clearRuntimeAuthForAccount(
    account: ClaudeManagedAccount,
    managedOauthAccount: unknown
  ): Promise<void>
  protected abstract restoreSystemDefaultSnapshotForMissingManagedCredentials(
    account: ClaudeManagedAccount,
    managedOauthAccount: unknown
  ): Promise<void>
  protected abstract readRuntimeCredentialsFile(): string | null
  protected abstract runtimeCredentialsBelongToAccount(
    credentialsJson: string | null,
    account: ClaudeManagedAccount,
    managedOauthAccount: unknown
  ): boolean
  protected abstract clearLastWrittenRuntimeState(): void
  protected abstract hasUnchangedRuntimeCredentials(
    previouslyWrittenCredentialsJson: string | null
  ): boolean
  protected abstract runtimeCredentialsChangedSinceLastWrite(
    baselineCredentialsJson: string
  ): boolean
  protected abstract restoreRuntimeCredentials(credentialsJson: string | null): void
  protected abstract restoreRuntimeOauthAccountIfOwned(
    oauthAccount: unknown,
    ownedOauthAccount: unknown,
    options: { allowCredentialSurfaceOwnership: boolean }
  ): void
  protected abstract hasUnchangedActiveClaudeKeychainCredentials(
    snapshotValue: ClaudeKeychainSnapshotValue,
    previouslyWrittenCredentialsJson: string | null,
    configDir?: string
  ): Promise<boolean>
  protected abstract restoreActiveClaudeKeychainCredentials(
    credentialsJson: string | null,
    configDir?: string
  ): Promise<void>
  protected abstract hasActiveKeychainCredentialsForAccount(
    account: ClaudeManagedAccount,
    managedOauthAccount: unknown,
    configDir?: string
  ): Promise<boolean>
  protected abstract readRuntimeOauthAccount(): unknown
  protected abstract runtimeOauthAccountMatches(managedOauthAccount: unknown): boolean
  protected abstract writeRuntimeOauthAccount(oauthAccount: unknown): boolean
  protected abstract jsonValuesEqual(left: unknown, right: unknown): boolean
  protected abstract sortJsonValue(value: unknown): unknown
  protected abstract isSystemDefaultSnapshot(value: unknown): value is ClaudeSystemDefaultSnapshot
  protected abstract isOptionalNullableString(value: unknown): boolean
  protected abstract isOptionalBoolean(value: unknown): boolean
  protected abstract snapshotKeychainCredentials(
    credentialsJson: string | null,
    previousSnapshot: ClaudeSystemDefaultSnapshot | null | undefined,
    service: 'scoped' | 'legacy',
    managedCredentialsJson: string | undefined
  ): string | null
  protected abstract hasValidKeychainSnapshotValue(
    snapshot: Record<string, unknown>,
    service: 'scoped' | 'legacy'
  ): boolean
  protected abstract readKeychainSnapshotValue(
    snapshot: ClaudeSystemDefaultSnapshot | null,
    service: 'scoped' | 'legacy'
  ): ClaudeKeychainSnapshotValue
  protected abstract readAggregateClaudeKeychainCredentialsBestEffort(
    configDir: string
  ): Promise<string | null>
  protected abstract readActiveClaudeKeychainCredentialsBestEffort(
    configDir?: string
  ): Promise<string | null>
  protected abstract readActiveClaudeKeychainCredentialsForSnapshot(
    configDir?: string
  ): Promise<ClaudeKeychainReadResult>
  protected abstract writeRuntimeCredentials(contents: string): void
  protected abstract writeJson(targetPath: string, value: unknown): void
  protected abstract fileContentsEqual(targetPath: string, contents: string): boolean
  protected abstract ensureOwnerOnlyMode(targetPath: string): void
  protected abstract readJsonObject(targetPath: string): Record<string, unknown> | null
  protected abstract getRuntimeMetadataDir(): string
  protected abstract getSystemDefaultSnapshotPath(): string
}
