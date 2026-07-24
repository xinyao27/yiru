import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
/* eslint-disable max-lines -- Why: this service intentionally keeps Codex
account lifecycle, path safety, login, and identity parsing in one audited
main-process module so the managed-account boundary stays explicit. */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'
import { app } from 'electron'

import type {
  CodexManagedAccount,
  CodexManagedAccountSummary,
  CodexRateLimitAccountsState,
  CodexSystemDefaultIdentity
} from '../../shared/types'
import { MANAGED_HOOK_TIMEOUT_SECONDS } from '../agent-hooks/installer-utils'
import { resolveCodexCommand } from '../codex-cli/command'
import { syncSystemConfigIntoManagedCodexHome } from '../codex/codex-config-mirror'
import { rewriteRelativePathConfigValues } from '../codex/codex-config-path-reference-rewrite'
import { getSystemCodexHomePath } from '../codex/codex-home-paths'
import { stripCodexManagedHookTrustEntriesFromConfig } from '../codex/codex-managed-trust-reconciliation'
import { readCodexTopLevelModelProvider } from '../codex/codex-model-provider-config'
import { isCodexSystemDefaultRealHomeEnabled } from '../codex/codex-real-home-flag'
import { getCodexManagedHookInstallMaterial } from '../codex/hook-service'
import type { Store } from '../persistence'
import type { RateLimitService } from '../rate-limits/service'
import { getSpawnArgsForWindows } from '../win32-utils'
import { toWindowsWslPath } from '../wsl'
import { buildEncodedWslBashCommand } from '../wsl-bash-command'
import { writeFileAtomically } from './fs-utils'
import { assertOwnedHostCodexManagedHomePath } from './host-codex-managed-home-ownership'
import type { CodexRuntimeHomeService } from './runtime-home-service'
import {
  getCodexSelectionTargetForAccount,
  getSelectedCodexAccountIdForTarget,
  normalizeCodexAccountSelectionTarget,
  normalizeCodexRuntimeSelection,
  pruneInvalidCodexRuntimeSelection,
  removeCodexAccountIdFromSelection,
  setSelectedCodexAccountIdForTarget,
  type CodexAccountSelectionTarget
} from './runtime-selection'
import {
  buildWslCodexAvailabilityArgs,
  buildWslCodexLoginArgs,
  WSL_CODEX_AVAILABILITY_TIMEOUT_MS
} from './wsl-codex-command'

const LOGIN_TIMEOUT_MS = 120_000
const MAX_LOGIN_OUTPUT_CHARS = 4_000
const WINDOWS_RM_MAX_RETRIES = 8
const WINDOWS_RM_RETRY_DELAY_MS = 150
const WINDOWS_LOGIN_AUTH_POLL_INTERVAL_MS = 500
const WINDOWS_LOGIN_POST_AUTH_EXIT_GRACE_MS = 5_000
const WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS = 5_000

type CodexOAuthCredentials = {
  idToken: string | null
  accountId: string | null
}

type ResolvedCodexIdentity = {
  email: string | null
  providerAccountId: string | null
  workspaceLabel: string | null
  workspaceAccountId: string | null
}

type CanonicalCodexConfig = {
  contents: string
  /** Home the config was read from, in the path style Codex sees at runtime
   *  (Linux-side for WSL); relative path-valued settings resolve against it. */
  sourceHomePath: string
  sourceHooksPath: string
}

export type CodexAccountAddTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

type ManagedHomeLocation = {
  managedHomePath: string
  managedHomeRuntime: 'host' | 'wsl'
  wslDistro: string | null
  wslLinuxHomePath: string | null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function removeManagedHomeTreeSync(targetPath: string): void {
  rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: WINDOWS_RM_MAX_RETRIES,
    retryDelay: WINDOWS_RM_RETRY_DELAY_MS
  })
}

function killLoginProcessTree(child: ChildProcess): void {
  if (
    process.platform === 'win32' &&
    typeof child.pid === 'number' &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        timeout: WINDOWS_LOGIN_TREE_KILL_TIMEOUT_MS,
        stdio: 'ignore'
      })
      return
    } catch {
      // Why: taskkill can race an already-exited tree; the direct child still
      // needs the ordinary signal as a bounded fallback.
    }
  }
  child.kill()
}

function readLoginAuthSnapshot(path: string): string | null | undefined {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? null : undefined
  }
}

function loginAuthChanged(
  initial: string | null | undefined,
  current: string | null | undefined
): boolean {
  return initial !== undefined && current !== undefined && current !== null && current !== initial
}

export class CodexAccountService {
  // Why: account mutations read settings, do async work (login, rate-limit
  // refresh), then write settings. Without serialization, overlapping calls
  // (e.g. double-click "Add Account") can cause lost updates.
  private mutationQueue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: Store,
    private readonly rateLimits: RateLimitService,
    private readonly runtimeHome: CodexRuntimeHomeService
  ) {
    this.safeSyncCanonicalConfigToManagedHomes()
  }

  private serializeMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(fn, fn)
    this.mutationQueue = next.catch(() => {})
    return next
  }

  listAccounts(): CodexRateLimitAccountsState {
    this.normalizeActiveSelection()
    return this.getSnapshot()
  }

  async addAccount(target?: CodexAccountAddTarget): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => this.doAddAccount(target))
  }

  async reauthenticateAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => this.doReauthenticateAccount(accountId))
  }

  async removeAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => this.doRemoveAccount(accountId))
  }

  async selectAccount(accountId: string | null): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => this.doSelectAccount(accountId))
  }

  async selectAccountForTarget(
    accountId: string | null,
    target?: CodexAccountSelectionTarget
  ): Promise<CodexRateLimitAccountsState> {
    return this.serializeMutation(() => this.doSelectAccount(accountId, target))
  }

  private startQuotaRefreshInBackground(
    outgoingAccountId: string | null | undefined,
    target: CodexAccountSelectionTarget | undefined
  ): void {
    // Why: cold account homes can take tens of seconds to probe. The durable
    // account mutation must resolve independently of this best-effort refresh.
    void this.rateLimits.refreshForCodexAccountChange(outgoingAccountId, target).catch((error) => {
      console.error('[codex-accounts] Quota refresh after account change failed:', error)
    })
  }

  private async doAddAccount(target?: CodexAccountAddTarget): Promise<CodexRateLimitAccountsState> {
    const accountId = randomUUID()
    const managedHome = this.createManagedHome(accountId, target)
    const { managedHomePath } = managedHome

    try {
      const canonicalConfig = this.readCanonicalConfigForManagedHome(managedHomePath)
      this.assertOAuthAccountAddAllowed(canonicalConfig)
      this.safeSyncCanonicalConfigIntoManagedHome(managedHomePath, accountId, canonicalConfig)
      await this.runCodexLogin(managedHomePath)
      const identity = this.readIdentityFromHome(managedHomePath)
      if (!identity.email) {
        throw new Error('Codex login completed, but Yiru could not resolve the account email.')
      }

      const now = Date.now()
      const account: CodexManagedAccount = {
        id: accountId,
        email: identity.email,
        managedHomePath,
        managedHomeRuntime: managedHome.managedHomeRuntime,
        wslDistro: managedHome.wslDistro,
        wslLinuxHomePath: managedHome.wslLinuxHomePath,
        providerAccountId: identity.providerAccountId,
        workspaceLabel: identity.workspaceLabel,
        workspaceAccountId: identity.workspaceAccountId,
        createdAt: now,
        updatedAt: now,
        lastAuthenticatedAt: now
      }

      const settings = this.store.getSettings()
      const selection = normalizeCodexRuntimeSelection(settings)
      const targetSelection = getCodexSelectionTargetForAccount(account)
      this.store.updateSettings({
        codexManagedAccounts: [...settings.codexManagedAccounts, account],
        activeCodexManagedAccountId:
          targetSelection.runtime === 'host' ? account.id : selection.host,
        activeCodexManagedAccountIdsByRuntime: setSelectedCodexAccountIdForTarget(
          selection,
          account.id,
          targetSelection
        )
      })
      this.safeSyncCanonicalConfigToManagedHomes()
      this.runtimeHome.clearLastWrittenAuthJson(account.id)
      this.runtimeHome.syncForCurrentSelection()

      // Why: the new account becomes active, so the previous active account is
      // now inactive and its last-known usage should be cached for the switcher.
      const outgoingAccountId = getSelectedCodexAccountIdForTarget(settings, targetSelection)
      this.startQuotaRefreshInBackground(outgoingAccountId, targetSelection)
      return this.getSnapshot()
    } catch (error) {
      this.safeRemoveManagedHome(managedHomePath, accountId)
      throw error
    }
  }

  private async doReauthenticateAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    const account = this.requireAccount(accountId)
    const managedHomePath = this.ensureManagedHomeForReauthentication(account)
    const accountTarget = getCodexSelectionTargetForAccount(account)
    const selectedAccountId = getSelectedCodexAccountIdForTarget(
      this.store.getSettings(),
      accountTarget
    )

    this.safeSyncCanonicalConfigIntoManagedHome(managedHomePath, account.id)
    let identity: ResolvedCodexIdentity
    try {
      await this.runCodexLogin(managedHomePath)
      identity = this.readIdentityFromHome(managedHomePath)
      if (!identity.email) {
        throw new Error('Codex login completed, but Yiru could not resolve the account email.')
      }
    } catch (error) {
      const currentSettings = this.store.getSettings()
      const restoredSelection = setSelectedCodexAccountIdForTarget(
        normalizeCodexRuntimeSelection(currentSettings),
        selectedAccountId,
        accountTarget
      )
      // Why: the login subprocess can transiently clear this runtime's active
      // account; a failed re-auth must leave the prior selection intact.
      this.store.updateSettings({
        activeCodexManagedAccountId: restoredSelection.host,
        activeCodexManagedAccountIdsByRuntime: restoredSelection
      })
      throw error
    }

    const settings = this.store.getSettings()
    const now = Date.now()
    const updatedAccounts = settings.codexManagedAccounts.map((entry) =>
      entry.id === accountId
        ? {
            ...entry,
            email: identity.email!,
            providerAccountId: identity.providerAccountId,
            workspaceLabel: identity.workspaceLabel,
            workspaceAccountId: identity.workspaceAccountId,
            updatedAt: now,
            lastAuthenticatedAt: now
          }
        : entry
    )

    const activeSelection = setSelectedCodexAccountIdForTarget(
      normalizeCodexRuntimeSelection(settings),
      selectedAccountId,
      accountTarget
    )
    this.store.updateSettings({
      codexManagedAccounts: updatedAccounts,
      activeCodexManagedAccountId: activeSelection.host,
      activeCodexManagedAccountIdsByRuntime: activeSelection
    })
    this.safeSyncCanonicalConfigToManagedHomes()
    this.runtimeHome.clearLastWrittenAuthJson(accountId)
    this.runtimeHome.syncForCurrentSelection(accountTarget)

    // Why: re-auth can change which actual Codex identity the managed home
    // points at. Force a fresh read immediately so the status bar cannot keep
    // showing the previous account's quota under the updated label.
    this.startQuotaRefreshInBackground(undefined, accountTarget)
    return this.getSnapshot()
  }

  private async doRemoveAccount(accountId: string): Promise<CodexRateLimitAccountsState> {
    const account = this.requireAccount(accountId)
    const settings = this.store.getSettings()
    const nextAccounts = settings.codexManagedAccounts.filter((entry) => entry.id !== accountId)
    const nextSelection = removeCodexAccountIdFromSelection(
      normalizeCodexRuntimeSelection(settings),
      accountId
    )
    const nextActiveId =
      settings.activeCodexManagedAccountId === accountId ? null : nextSelection.host

    this.store.updateSettings({
      codexManagedAccounts: nextAccounts,
      activeCodexManagedAccountId: nextActiveId,
      activeCodexManagedAccountIdsByRuntime: nextSelection
    })
    this.runtimeHome.syncForCurrentSelection()

    this.safeRemoveManagedHome(account.managedHomePath, account.id)
    // Why: a removed account can no longer appear in the switcher dropdown,
    // so purge its cached usage to avoid stale entries.
    this.rateLimits.evictInactiveCodexCache(accountId)
    this.startQuotaRefreshInBackground(
      getSelectedCodexAccountIdForTarget(settings, getCodexSelectionTargetForAccount(account)) ===
        accountId
        ? accountId
        : undefined,
      getCodexSelectionTargetForAccount(account)
    )
    return this.getSnapshot()
  }

  private async doSelectAccount(
    accountId: string | null,
    target?: CodexAccountSelectionTarget
  ): Promise<CodexRateLimitAccountsState> {
    let effectiveTarget = target
    if (accountId !== null) {
      const account = this.requireAccount(accountId)
      const accountTarget = getCodexSelectionTargetForAccount(account)
      const requestedTarget = normalizeCodexAccountSelectionTarget(target ?? accountTarget)
      const normalizedAccountTarget = normalizeCodexAccountSelectionTarget(accountTarget)
      if (
        requestedTarget.runtime !== normalizedAccountTarget.runtime ||
        (requestedTarget.wslDistro !== null &&
          requestedTarget.wslDistro !== normalizedAccountTarget.wslDistro)
      ) {
        throw new Error('That Codex account belongs to a different runtime.')
      }
      effectiveTarget = accountTarget
    }

    const previousSettings = this.store.getSettings()
    const selection = normalizeCodexRuntimeSelection(previousSettings)
    const outgoingAccountId = getSelectedCodexAccountIdForTarget(previousSettings, effectiveTarget)
    const nextSelection = setSelectedCodexAccountIdForTarget(selection, accountId, effectiveTarget)

    this.store.updateSettings({
      activeCodexManagedAccountId:
        effectiveTarget?.runtime === 'wsl' ? nextSelection.host : accountId,
      activeCodexManagedAccountIdsByRuntime: nextSelection
    })
    this.safeSyncCanonicalConfigToManagedHomes()
    this.runtimeHome.syncForCurrentSelection(effectiveTarget)

    this.startQuotaRefreshInBackground(outgoingAccountId, effectiveTarget)
    return this.getSnapshot()
  }

  private getSnapshot(): CodexRateLimitAccountsState {
    const settings = this.store.getSettings()
    return {
      accounts: settings.codexManagedAccounts
        .map((account) => this.toSummary(account))
        .sort((a, b) => b.updatedAt - a.updatedAt),
      activeAccountId: normalizeCodexRuntimeSelection(settings).host,
      activeAccountIdsByRuntime: normalizeCodexRuntimeSelection(settings),
      systemDefault: this.resolveSystemDefaultIdentity()
    }
  }

  private resolveSystemDefaultIdentity(): CodexSystemDefaultIdentity {
    let contents: string
    try {
      contents = readFileSync(join(homedir(), '.codex', 'auth.json'), 'utf-8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        console.warn('[codex-accounts] Failed to read system-default Codex identity', code)
      }
      const envKey = process.env.OPENAI_API_KEY?.trim()
      return {
        hasAuth: code !== 'ENOENT' && code !== 'ENOTDIR',
        authKind: envKey ? 'api-key' : 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      console.warn('[codex-accounts] System-default Codex auth is not valid JSON')
      return {
        hasAuth: true,
        authKind: 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('[codex-accounts] System-default Codex auth has an unexpected format')
      return {
        hasAuth: true,
        authKind: 'none',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    const raw = parsed as Record<string, unknown>
    if (typeof raw.OPENAI_API_KEY === 'string' && raw.OPENAI_API_KEY.trim()) {
      return {
        hasAuth: true,
        authKind: 'api-key',
        email: null,
        providerAccountId: null,
        workspaceLabel: null
      }
    }
    const tokens = this.readRecordClaim(raw, 'tokens')
    const idToken = this.normalizeField(
      this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
    )
    const payload = idToken ? this.parseJwtPayload(idToken) : null
    const authClaims = this.readRecordClaim(payload, 'https://api.openai.com/auth')
    const profileClaims = this.readRecordClaim(payload, 'https://api.openai.com/profile')
    return {
      hasAuth: true,
      authKind: 'oauth',
      email: this.normalizeField(
        this.readStringClaim(payload, 'email') ?? this.readStringClaim(profileClaims, 'email')
      ),
      providerAccountId: this.normalizeField(
        this.readStringClaim(tokens, 'account_id') ??
          this.readStringClaim(authClaims, 'chatgpt_account_id')
      ),
      workspaceLabel: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_name') ??
          this.readStringClaim(profileClaims, 'workspace_name')
      )
    }
  }

  private toSummary(account: CodexManagedAccount): CodexManagedAccountSummary {
    return {
      id: account.id,
      email: account.email,
      managedHomeRuntime: account.managedHomeRuntime ?? 'host',
      wslDistro: account.wslDistro ?? null,
      providerAccountId: account.providerAccountId ?? null,
      workspaceLabel: account.workspaceLabel ?? null,
      workspaceAccountId: account.workspaceAccountId ?? null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastAuthenticatedAt: account.lastAuthenticatedAt
    }
  }

  private requireAccount(accountId: string): CodexManagedAccount {
    const settings = this.store.getSettings()
    const account = settings.codexManagedAccounts.find((entry) => entry.id === accountId)
    if (!account) {
      throw new Error('That Codex rate limit account no longer exists.')
    }
    return account
  }

  private normalizeActiveSelection(): void {
    const settings = this.store.getSettings()
    const selection = normalizeCodexRuntimeSelection(settings)
    const nextSelection = pruneInvalidCodexRuntimeSelection(
      selection,
      settings.codexManagedAccounts
    )
    const changed =
      nextSelection.host !== selection.host ||
      JSON.stringify(nextSelection.wsl) !== JSON.stringify(selection.wsl)
    if (changed) {
      this.store.updateSettings({
        activeCodexManagedAccountId: nextSelection.host,
        activeCodexManagedAccountIdsByRuntime: nextSelection
      })
    }
  }

  private createManagedHome(
    accountId: string,
    target?: CodexAccountAddTarget
  ): ManagedHomeLocation {
    const wslHome = this.tryCreateWslManagedHome(accountId, target)
    if (wslHome) {
      return wslHome
    }

    const managedHomePath = join(this.getManagedAccountsRoot(), accountId, 'home')
    mkdirSync(managedHomePath, { recursive: true })
    // Why: Codex expects CODEX_HOME to be a concrete directory it can own. We
    // pre-create the directory and leave a marker so future cleanup code can
    // prove the path belongs to Yiru before deleting anything.
    writeFileSync(join(managedHomePath, '.yiru-managed-home'), `${accountId}\n`, 'utf-8')
    return {
      managedHomePath: this.assertManagedHomePath(managedHomePath, accountId),
      managedHomeRuntime: 'host',
      wslDistro: null,
      wslLinuxHomePath: null
    }
  }

  private tryCreateWslManagedHome(
    accountId: string,
    target?: CodexAccountAddTarget
  ): ManagedHomeLocation | null {
    if (process.platform !== 'win32' || target?.runtime !== 'wsl') {
      return null
    }

    const distroArgs = target.wslDistro?.trim() ? ['-d', target.wslDistro.trim()] : []
    const infoOutput = execFileSync(
      'wsl.exe',
      [...distroArgs, '--', 'bash', '-lc', 'printf "%s\\n%s\\n" "$WSL_DISTRO_NAME" "$HOME"'],
      { encoding: 'utf-8', timeout: 5000 }
    )
    const [rawDistro, rawHome] = infoOutput
      .replaceAll(String.fromCharCode(0), '')
      .split(/\r?\n/)
      .map((line) => line.trim())
    const distro = target.wslDistro?.trim() || rawDistro
    const home = rawHome
    if (!distro || !home?.startsWith('/')) {
      throw new Error('Could not resolve the active WSL home directory for Codex login.')
    }

    const wslLinuxHomePath = `${home.replace(/\/$/, '')}/.local/share/yiru/codex-accounts/${accountId}/home`
    const markerPath = `${wslLinuxHomePath}/.yiru-managed-home`
    execFileSync(
      'wsl.exe',
      [
        '-d',
        distro,
        '--',
        'bash',
        '-lc',
        `mkdir -p ${shellQuote(wslLinuxHomePath)} && printf '%s\\n' ${shellQuote(accountId)} > ${shellQuote(markerPath)}`
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )

    const managedHomePath = toWindowsWslPath(wslLinuxHomePath, distro)
    let trustedManagedHomePath: string
    try {
      trustedManagedHomePath = this.assertManagedHomePath(managedHomePath, accountId)
    } catch (error) {
      this.safeRemoveWslManagedHomeCandidate(distro, wslLinuxHomePath, accountId)
      throw error
    }

    return {
      managedHomePath: trustedManagedHomePath,
      managedHomeRuntime: 'wsl',
      wslDistro: distro,
      wslLinuxHomePath
    }
  }

  private safeSyncCanonicalConfigToManagedHomes(): void {
    try {
      this.syncCanonicalConfigToManagedHomes()
    } catch (error) {
      console.warn('[codex-accounts] Failed to sync canonical config:', error)
    }
  }

  private safeSyncCanonicalConfigIntoManagedHome(
    managedHomePath: string,
    expectedAccountId?: string,
    canonicalConfig?: CanonicalCodexConfig | null
  ): void {
    try {
      this.syncCanonicalConfigIntoManagedHome(managedHomePath, canonicalConfig, expectedAccountId)
    } catch (error) {
      console.warn('[codex-accounts] Failed to seed managed config:', error)
    }
  }

  private syncCanonicalConfigToManagedHomes(): void {
    const settings = this.store.getSettings()
    for (const account of settings.codexManagedAccounts) {
      try {
        this.syncCanonicalConfigIntoManagedHome(account.managedHomePath, undefined, account.id)
      } catch (error) {
        console.warn('[codex-accounts] Failed to sync managed config:', error)
      }
    }
  }

  private syncCanonicalConfigIntoManagedHome(
    managedHomePath: string,
    canonicalConfig = this.readCanonicalConfigForManagedHome(managedHomePath),
    expectedAccountId?: string
  ): void {
    if (canonicalConfig === null) {
      return
    }

    const trustedManagedHomePath = this.assertManagedHomePath(managedHomePath, expectedAccountId)
    if (isCodexSystemDefaultRealHomeEnabled() && !parseWslUncPath(trustedManagedHomePath)) {
      // Why: the account home is now the live CODEX_HOME. Merge canonical
      // settings so account-local hook and project trust survives switching.
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath: trustedManagedHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      return
    }
    // Why: Yiru account switching is meant to swap Codex credentials and quota
    // identity, not silently fork the user's sandbox/config defaults. Syncing
    // one canonical config into every managed home keeps auth isolated per
    // account while preserving consistent Codex behavior. Managed homes are
    // real CODEX_HOMEs for `codex login`, so relative path-valued settings
    // must keep resolving against the home the config was read from.
    let sanitizedConfig = canonicalConfig.contents
    if (isCodexSystemDefaultRealHomeEnabled()) {
      const material = getCodexManagedHookInstallMaterial()
      // Why: source-home Yiru trust points at a different hooks.json and must
      // not be copied into the WSL account lane as if it authorized that home.
      sanitizedConfig = stripCodexManagedHookTrustEntriesFromConfig(canonicalConfig.contents, {
        runtimeHomePath: canonicalConfig.sourceHomePath,
        sourcePath: canonicalConfig.sourceHooksPath,
        command: material.command,
        managedEventLabels: new Set(Object.values(material.eventLabel)),
        timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
      })
    }
    this.writeManagedConfig(
      trustedManagedHomePath,
      rewriteRelativePathConfigValues(sanitizedConfig, canonicalConfig.sourceHomePath)
    )
  }

  private readCanonicalConfig(): CanonicalCodexConfig | null {
    const sourceHomePath = join(homedir(), '.codex')
    const primaryConfigPath = join(sourceHomePath, 'config.toml')
    if (!existsSync(primaryConfigPath)) {
      return null
    }

    try {
      return {
        contents: readFileSync(primaryConfigPath, 'utf-8'),
        sourceHomePath,
        sourceHooksPath: join(sourceHomePath, 'hooks.json')
      }
    } catch (error) {
      console.warn('[codex-accounts] Failed to read canonical config:', error)
      return null
    }
  }

  private readCanonicalConfigForManagedHome(managedHomePath: string): CanonicalCodexConfig | null {
    const wslInfo = parseWslUncPath(managedHomePath)
    if (!wslInfo) {
      return this.readCanonicalConfig()
    }

    const managedRootMarker = '/.local/share/yiru/codex-accounts/'
    const markerIndex = wslInfo.linuxPath.indexOf(managedRootMarker)
    if (markerIndex < 0) {
      return null
    }
    const wslHome = wslInfo.linuxPath.slice(0, markerIndex)
    const configPath = toWindowsWslPath(`${wslHome}/.codex/config.toml`, wslInfo.distro)
    if (!existsSync(configPath)) {
      return null
    }

    try {
      // Why: the config is read over UNC but consumed by Codex inside WSL, so
      // path rewrites must anchor to the Linux-side ~/.codex, not the UNC path.
      return {
        contents: readFileSync(configPath, 'utf-8'),
        sourceHomePath: `${wslHome}/.codex`,
        sourceHooksPath: `${wslHome}/.codex/hooks.json`
      }
    } catch (error) {
      console.warn('[codex-accounts] Failed to read WSL canonical config:', error)
      return null
    }
  }

  private assertOAuthAccountAddAllowed(canonicalConfig: CanonicalCodexConfig | null): void {
    const provider = canonicalConfig
      ? readCodexTopLevelModelProvider(canonicalConfig.contents)
      : null
    if (!provider || provider === 'openai') {
      return
    }
    // Why: copying a custom-provider pin into an OAuth home makes the new
    // account credentials inert while appearing to have signed in normally.
    throw new Error(
      `Yiru cannot add a Codex OAuth account while ~/.codex/config.toml pins the custom provider ${JSON.stringify(provider)}. Keep using the system-default account for this provider, or remove model_provider (or set it to "openai") before adding an OAuth account. Yiru left your config unchanged.`
    )
  }

  private writeManagedConfig(managedHomePath: string, contents: string): void {
    const configPath = join(managedHomePath, 'config.toml')
    try {
      if (existsSync(configPath) && readFileSync(configPath, 'utf-8') === contents) {
        return
      }
    } catch {
      // Why: read errors should not make a stale config look current; the
      // atomic write path owns Windows ACL repair and persistent error surfacing.
    }
    writeFileAtomically(configPath, contents)
  }

  private getManagedAccountsRoot(): string {
    const root = join(app.getPath('userData'), 'codex-accounts')
    mkdirSync(root, { recursive: true })
    return root
  }

  private ensureManagedHomeForReauthentication(account: CodexManagedAccount): string {
    const wslInfo = parseWslUncPath(account.managedHomePath)
    if (wslInfo && process.platform === 'win32') {
      this.ensureExpectedWslManagedHomeForReauthentication(account, wslInfo)
      return this.assertManagedHomePath(account.managedHomePath, account.id)
    }

    try {
      return this.assertManagedHomePath(account.managedHomePath, account.id)
    } catch (error) {
      if (!this.isMissingManagedHomeError(error)) {
        throw error
      }
      return this.recreateExpectedHostManagedHomeForReauthentication(account, error)
    }
  }

  private recreateExpectedHostManagedHomeForReauthentication(
    account: CodexManagedAccount,
    originalError: unknown
  ): string {
    const expectedManagedHomePath = join(this.getManagedAccountsRoot(), account.id, 'home')
    if (!this.pathsEqual(account.managedHomePath, expectedManagedHomePath)) {
      throw originalError
    }

    // Why: explicit re-auth is allowed to recover from a lost empty container,
    // but only at the exact Yiru-owned account path persisted for this account.
    mkdirSync(expectedManagedHomePath, { recursive: true })
    writeFileSync(join(expectedManagedHomePath, '.yiru-managed-home'), `${account.id}\n`, 'utf-8')
    return this.assertManagedHomePath(expectedManagedHomePath, account.id)
  }

  private ensureExpectedWslManagedHomeForReauthentication(
    account: CodexManagedAccount,
    wslInfo: { distro: string; linuxPath: string }
  ): void {
    if (
      account.managedHomeRuntime !== 'wsl' ||
      account.wslDistro !== wslInfo.distro ||
      account.wslLinuxHomePath !== wslInfo.linuxPath ||
      !wslInfo.linuxPath.endsWith(`/.local/share/yiru/codex-accounts/${account.id}/home`)
    ) {
      return
    }

    execFileSync(
      'wsl.exe',
      [
        '-d',
        wslInfo.distro,
        '--',
        'bash',
        '-lc',
        buildEncodedWslBashCommand(
          [
            'set -euo pipefail',
            `candidate=${shellQuote(wslInfo.linuxPath)}`,
            `expected_marker=${shellQuote(account.id)}`,
            'marker="$candidate/.yiru-managed-home"',
            'if [ -e "$candidate" ] && [ ! -f "$marker" ]; then exit 41; fi',
            'if [ -f "$marker" ] && [ "$(cat "$marker")" != "$expected_marker" ]; then exit 42; fi',
            'mkdir -p -- "$candidate"',
            'printf "%s\\n" "$expected_marker" > "$marker"'
          ].join('\n')
        )
      ],
      { encoding: 'utf-8', timeout: 5000 }
    )
  }

  private isMissingManagedHomeError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message === 'Managed Codex home directory does not exist on disk.'
    )
  }

  private pathsEqual(left: string, right: string): boolean {
    const resolvedLeft = resolve(left)
    const resolvedRight = resolve(right)
    if (process.platform === 'win32') {
      return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    }
    return resolvedLeft === resolvedRight
  }

  private assertManagedHomePath(candidatePath: string, expectedAccountId?: string): string {
    const wslInfo = parseWslUncPath(candidatePath)
    if (wslInfo) {
      if (
        !wslInfo.linuxPath.includes('/.local/share/yiru/codex-accounts/') ||
        !wslInfo.linuxPath.endsWith('/home')
      ) {
        throw new Error('Managed WSL Codex home is outside Yiru account storage.')
      }
      if (
        expectedAccountId !== undefined &&
        !wslInfo.linuxPath.endsWith(`/.local/share/yiru/codex-accounts/${expectedAccountId}/home`)
      ) {
        throw new Error('Managed WSL Codex home does not match its persisted account ID.')
      }

      if (process.platform === 'win32') {
        try {
          const canonicalLinuxPath = execFileSync(
            'wsl.exe',
            [
              '-d',
              wslInfo.distro,
              '--',
              'bash',
              '-lc',
              buildEncodedWslBashCommand(
                [
                  'set -euo pipefail',
                  `candidate=${shellQuote(wslInfo.linuxPath)}`,
                  'managed_root="${HOME%/}/.local/share/yiru/codex-accounts"',
                  'candidate_real=$(readlink -f -- "$candidate")',
                  'managed_root_real=$(readlink -f -- "$managed_root")',
                  'test -f "$candidate_real/.yiru-managed-home"',
                  ...(expectedAccountId === undefined
                    ? [
                        'case "$candidate_real" in "$managed_root_real"/*/home) printf "%s\\n" "$candidate_real" ;; *) exit 35 ;; esac'
                      ]
                    : [
                        `expected_marker=${shellQuote(expectedAccountId)}`,
                        'test "$candidate_real" = "$managed_root_real/$expected_marker/home"',
                        'test "$(cat "$candidate_real/.yiru-managed-home")" = "$expected_marker"',
                        'printf "%s\\n" "$candidate_real"'
                      ])
                ].join('\n')
              )
            ],
            { encoding: 'utf-8', timeout: 5000 }
          ).trim()
          if (!canonicalLinuxPath) {
            throw new Error('Managed Codex home directory does not exist on disk.')
          }
          return toWindowsWslPath(canonicalLinuxPath, wslInfo.distro)
        } catch (error) {
          throw new Error('Managed WSL Codex home is outside Yiru account storage.', {
            cause: error
          })
        }
      }

      if (wslInfo.linuxPath.split('/').includes('..')) {
        throw new Error('Managed WSL Codex home is outside Yiru account storage.')
      }
      if (!existsSync(candidatePath)) {
        throw new Error('Managed Codex home directory does not exist on disk.')
      }
      if (!existsSync(join(candidatePath, '.yiru-managed-home'))) {
        throw new Error('Managed Codex home is missing Yiru ownership marker.')
      }
      if (
        expectedAccountId !== undefined &&
        readFileSync(join(candidatePath, '.yiru-managed-home'), 'utf-8').trim() !==
          expectedAccountId
      ) {
        throw new Error('Managed WSL Codex home ownership marker does not match its account ID.')
      }
      return candidatePath
    }

    return assertOwnedHostCodexManagedHomePath({
      candidatePath,
      managedAccountsRoot: this.getManagedAccountsRoot(),
      systemCodexHomePath: getSystemCodexHomePath(),
      expectedAccountId
    })
  }

  private safeRemoveWslManagedHomeCandidate(
    distro: string,
    linuxHomePath: string,
    expectedAccountId: string
  ): void {
    // Why: WSL home creation can fail after mkdir/marker write but before the
    // path is trusted. Cleanup must prove the marker/account ID inside WSL.
    try {
      execFileSync(
        'wsl.exe',
        [
          '-d',
          distro,
          '--',
          'bash',
          '-lc',
          buildEncodedWslBashCommand(
            [
              'set -euo pipefail',
              `candidate=${shellQuote(linuxHomePath)}`,
              `expected_marker=${shellQuote(expectedAccountId)}`,
              'managed_root="${HOME%/}/.local/share/yiru/codex-accounts"',
              'candidate_real=$(readlink -f -- "$candidate" 2>/dev/null || true)',
              'managed_root_real=$(readlink -f -- "$managed_root" 2>/dev/null || true)',
              'test -n "$candidate_real"',
              'test -n "$managed_root_real"',
              'case "$candidate_real" in "$managed_root_real"/*/home) ;; *) exit 0 ;; esac',
              'test -f "$candidate_real/.yiru-managed-home"',
              'test "$(cat "$candidate_real/.yiru-managed-home")" = "$expected_marker"',
              'rm -rf -- "$candidate_real"',
              'parent_dir=$(dirname -- "$candidate_real")',
              'case "$parent_dir" in "$managed_root_real"/*) rmdir -- "$parent_dir" 2>/dev/null || true ;; esac'
            ].join('\n')
          )
        ],
        { encoding: 'utf-8', timeout: 5000 }
      )
    } catch (error) {
      console.warn('[codex-accounts] Failed to clean up WSL managed home candidate:', error)
    }
  }

  private safeRemoveManagedHome(candidatePath: string, expectedAccountId: string): void {
    let managedHomePath: string
    try {
      managedHomePath = this.assertManagedHomePath(candidatePath, expectedAccountId)
    } catch (error) {
      console.warn('[codex-accounts] Refusing to remove untrusted managed home:', error)
      return
    }

    try {
      removeManagedHomeTreeSync(managedHomePath)
    } catch (error) {
      console.warn('[codex-accounts] Failed to remove managed home:', error)
      return
    }

    if (parseWslUncPath(managedHomePath)) {
      try {
        removeManagedHomeTreeSync(dirname(managedHomePath))
      } catch {
        // Best-effort cleanup
      }
      return
    }

    // Why: managed homes live at <accounts-root>/<uuid>/home. Removing
    // just the home/ leaf leaves an empty <uuid>/ directory behind.
    try {
      const parentDir = resolve(managedHomePath, '..')
      // Why: managedHomePath is already canonicalized by assertManagedHomePath,
      // so the root must be canonicalized too for the prefix check to work on
      // macOS where userData resolves through /private/var.
      const root = realpathSync(this.getManagedAccountsRoot())
      if (parentDir.startsWith(root + sep) && parentDir !== root) {
        removeManagedHomeTreeSync(parentDir)
      }
    } catch {
      // Best-effort cleanup
    }
  }

  private async runCodexLogin(managedHomePath: string): Promise<void> {
    const wslInfo = parseWslUncPath(managedHomePath)
    if (wslInfo) {
      this.assertWslCodexCliAvailable(wslInfo)
    }
    const initialAuthSnapshot = wslInfo
      ? null
      : readLoginAuthSnapshot(join(managedHomePath, 'auth.json'))

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const spawnConfig = wslInfo
        ? {
            command: 'wsl.exe',
            args: buildWslCodexLoginArgs(wslInfo.distro, wslInfo.linuxPath),
            env: process.env,
            codexCommand: 'codex'
          }
        : (() => {
            const codexCommand = resolveCodexCommand()
            // Why: on Windows, resolveCodexCommand() may return a .cmd/.bat file
            // (e.g. codex.cmd from npm). Node's child_process.spawn cannot execute
            // batch scripts directly without shell:true, but shell:true with an args
            // array causes DEP0190 because args are concatenated, not escaped.
            // Fix: detect batch scripts and invoke cmd.exe /c explicitly.
            const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(codexCommand, ['login'])
            return {
              command: spawnCmd,
              args: spawnArgs,
              env: {
                ...process.env,
                CODEX_HOME: managedHomePath
              },
              codexCommand
            }
          })()
      const child = spawn(spawnConfig.command, spawnConfig.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Why: route through cmd.exe for .cmd/.bat entrypoints would otherwise
        // flash a console window in the packaged GUI app on Windows.
        windowsHide: true,
        env: spawnConfig.env
      })

      let settled = false
      let output = ''
      const appendOutput = (chunk: Buffer): void => {
        output = `${output}${chunk.toString()}`
        if (output.length > MAX_LOGIN_OUTPUT_CHARS) {
          output = output.slice(-MAX_LOGIN_OUTPUT_CHARS)
        }
      }

      let timeout: ReturnType<typeof setTimeout> | null = null
      let authWatchInterval: ReturnType<typeof setInterval> | null = null
      let postAuthExitTimeout: ReturnType<typeof setTimeout> | null = null
      let loginTreeKilledAfterAuth = false
      const authJsonPath = join(managedHomePath, 'auth.json')
      const cleanupListeners = (): void => {
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        if (authWatchInterval) {
          clearInterval(authWatchInterval)
          authWatchInterval = null
        }
        if (postAuthExitTimeout) {
          clearTimeout(postAuthExitTimeout)
          postAuthExitTimeout = null
        }
        child.stdout.off('data', appendOutput)
        child.stderr.off('data', appendOutput)
        child.off('error', onError)
        child.off('close', onClose)
      }

      const settle = (callback: () => void): void => {
        if (settled) {
          return
        }
        settled = true
        cleanupListeners()
        callback()
      }

      const timeoutError = new Error('Codex sign-in took too long to finish. Please try again.')
      timeout = setTimeout(() => {
        killLoginProcessTree(child)
        settle(() => {
          rejectPromise(timeoutError)
        })
      }, LOGIN_TIMEOUT_MS)

      if (process.platform === 'win32' && !wslInfo) {
        authWatchInterval = setInterval(() => {
          if (!loginAuthChanged(initialAuthSnapshot, readLoginAuthSnapshot(authJsonPath))) {
            return
          }
          if (authWatchInterval) {
            clearInterval(authWatchInterval)
            authWatchInterval = null
          }
          postAuthExitTimeout = setTimeout(() => {
            loginTreeKilledAfterAuth = true
            killLoginProcessTree(child)
          }, WINDOWS_LOGIN_POST_AUTH_EXIT_GRACE_MS)
        }, WINDOWS_LOGIN_AUTH_POLL_INTERVAL_MS)
      }

      const onError = (error: Error): void => {
        settle(() => {
          const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT'
          // Why: ENOENT can mean either the codex binary doesn't exist OR the
          // script's shebang interpreter (node) isn't in PATH. When we resolved
          // codex to a full path, ENOENT almost certainly means node is missing.
          const isBareCommand = spawnConfig.codexCommand === 'codex'
          const message = isEnoent
            ? isBareCommand
              ? 'Codex CLI not found.'
              : 'Codex CLI found but could not run — Node.js may not be in your PATH.'
            : error.message
          rejectPromise(new Error(message))
        })
      }

      const onClose = (code: number | null): void => {
        settle(() => {
          if (code === 0 || (loginTreeKilledAfterAuth && existsSync(authJsonPath))) {
            resolvePromise()
            return
          }
          const trimmedOutput = output.trim()
          rejectPromise(
            new Error(
              trimmedOutput
                ? `Codex login failed: ${trimmedOutput}`
                : `Codex login exited with code ${code ?? 'unknown'}.`
            )
          )
        })
      }

      child.stdout.on('data', appendOutput)
      child.stderr.on('data', appendOutput)
      child.on('error', onError)
      child.on('close', onClose)
    })
  }

  private assertWslCodexCliAvailable(wslInfo: { distro: string; linuxPath: string }): void {
    try {
      execFileSync('wsl.exe', buildWslCodexAvailabilityArgs(wslInfo.distro), {
        encoding: 'utf-8',
        timeout: WSL_CODEX_AVAILABILITY_TIMEOUT_MS
      })
    } catch (error) {
      throw new Error(
        `Codex CLI is not available in WSL ${wslInfo.distro}. Install Codex in that distro or switch Account location to Windows.`,
        { cause: error }
      )
    }
  }

  private readIdentityFromHome(managedHomePath: string): ResolvedCodexIdentity {
    const credentials = this.loadOAuthCredentials(managedHomePath)
    const payload = credentials.idToken ? this.parseJwtPayload(credentials.idToken) : null
    const authClaims = this.readRecordClaim(payload, 'https://api.openai.com/auth')
    const profileClaims = this.readRecordClaim(payload, 'https://api.openai.com/profile')

    return {
      email: this.normalizeField(
        this.readStringClaim(payload, 'email') ?? this.readStringClaim(profileClaims, 'email')
      ),
      providerAccountId: this.normalizeField(
        credentials.accountId ??
          this.readStringClaim(authClaims, 'chatgpt_account_id') ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      ),
      workspaceLabel: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_name') ??
          this.readStringClaim(profileClaims, 'workspace_name')
      ),
      workspaceAccountId: this.normalizeField(
        this.readStringClaim(authClaims, 'workspace_account_id') ??
          credentials.accountId ??
          this.readStringClaim(payload, 'chatgpt_account_id')
      )
    }
  }

  private loadOAuthCredentials(managedHomePath: string): CodexOAuthCredentials {
    const authFilePath = join(this.assertManagedHomePath(managedHomePath), 'auth.json')
    let raw: Record<string, unknown>
    try {
      raw = JSON.parse(readFileSync(authFilePath, 'utf-8')) as Record<string, unknown>
    } catch {
      // Why: SyntaxError can echo credential bytes into logs or UI.
      throw new Error('Codex auth.json is corrupt or not valid JSON')
    }

    // Why: API-key-based auth files have no OAuth tokens or JWT identity
    // claims. Returning nulls causes the caller to fail with a clear
    // "could not resolve the account email" error rather than crashing
    // on missing nested token fields.
    if (typeof raw.OPENAI_API_KEY === 'string' && raw.OPENAI_API_KEY.trim() !== '') {
      return {
        idToken: null,
        accountId: null
      }
    }

    const tokens = this.readRecordClaim(raw, 'tokens')
    return {
      idToken: this.normalizeField(
        this.readStringClaim(tokens, 'id_token') ?? this.readStringClaim(tokens, 'idToken')
      ),
      accountId: this.normalizeField(
        this.readStringClaim(tokens, 'account_id') ?? this.readStringClaim(tokens, 'accountId')
      )
    }
  }

  private parseJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length < 2) {
      return null
    }

    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (payload.length % 4 !== 0) {
      payload += '='
    }

    try {
      const json = Buffer.from(payload, 'base64').toString('utf-8')
      return JSON.parse(json) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private readRecordClaim(
    value: Record<string, unknown> | null,
    key: string
  ): Record<string, unknown> | null {
    const claim = value?.[key]
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
      return null
    }
    return claim as Record<string, unknown>
  }

  private readStringClaim(value: Record<string, unknown> | null, key: string): string | null {
    const claim = value?.[key]
    return typeof claim === 'string' ? claim : null
  }

  private normalizeField(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
}
