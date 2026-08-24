import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { win32 as pathWin32 } from 'node:path'

import { resolveHooksJsonWritePath } from '../agent-hooks/hook-config-write-path'
import {
  createManagedCommandMatcher,
  hookDefinitionHasManagedCommand,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  readHooksJsonWithRaw,
  removeManagedCommands,
  writeHooksJson
} from '../agent-hooks/managed-hook-commands'
import { writeFileAtomically } from './accounts/atomic-file-operations'
import { writeConfigAtomically, type CodexTrustEntry } from './config-toml-trust'
import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from './home-paths'
import {
  getConfigPath,
  getCodexConfigTomlPath,
  CODEX_MANAGED_EVENT_LABELS,
  LEGACY_YIRU_PROFILE_BLOCK_START,
  LEGACY_YIRU_PROFILE_BLOCK_END,
  getManagedScriptPath,
  getManagedCommand,
  systemCodexHomeHookSweepSuppressed,
  wrapReadablePosixHookCommand,
  getSystemConfigPath,
  getSystemCodexConfigTomlPath,
  getLegacyCodexProfileTomlPath
} from './hook-foundation'
import { getCodexManagedScriptFileName } from './hook-identity'
import {
  collectManagedTrustEntries,
  removeSelfComputedMatchingTrustEntries
} from './hook-runtime-mirror'
import {
  readCodexTrustGrantLedgerHomeForReconciliation,
  removeCodexManagedHookTrustEntries,
  removeStaleWslCodexManagedHookTrustEntries
} from './managed-trust-reconciliation'
import type { CodexTrustGrantLedgerHome } from './trust-grant-ledger'
import { mutateRealHomeHooksPreservingUserTrust } from './user-hook-trust-rebase'
import type { CodexWslRuntimeHookInstallPlan } from './wsl-hook-install-plan'

export function removeSystemManagedHookTrustEntries(
  systemHomePath: string,
  hooksJsonPath: string
): void {
  removeCodexManagedHookTrustEntries({
    tomlPath: getSystemCodexConfigTomlPath(),
    runtimeHomePath: systemHomePath,
    sourcePath: hooksJsonPath,
    command: getManagedCommand(getManagedScriptPath()),
    managedEventLabels: CODEX_MANAGED_EVENT_LABELS,
    timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
  })
}

export function cleanupLegacySystemManagedHooks(): void {
  if (systemCodexHomeHookSweepSuppressed()) {
    return
  }
  const legacyConfigPath = getSystemConfigPath()
  const runtimeConfigPath = getConfigPath()
  if (legacyConfigPath === runtimeConfigPath) {
    return
  }

  const systemHomePath = getSystemCodexHomePath()
  const hasRecordedRealHomeGrant =
    readCodexTrustGrantLedgerHomeForReconciliation(systemHomePath) !== null
  // Why: the pre-write guard below compares against these bytes; a separate
  // later read would let a concurrent save land between parse and snapshot.
  const { raw: previousRaw, config } = readHooksJsonWithRaw(legacyConfigPath)
  if (!config?.hooks || previousRaw === null) {
    if (hasRecordedRealHomeGrant) {
      removeSystemManagedHookTrustEntries(systemHomePath, legacyConfigPath)
    }
    return
  }

  const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
  const nextHooks = { ...config.hooks }
  const trustEntries: CodexTrustEntry[] = []
  let removedManagedHook = false
  for (const [eventName, definitions] of Object.entries(nextHooks)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    const eventTrustEntries = collectManagedTrustEntries(
      legacyConfigPath,
      eventName,
      definitions,
      isManagedCommand
    )
    // Why: user hook configs can be large; avoid the argument limit from push(...entries).
    for (const entry of eventTrustEntries) {
      trustEntries.push(entry)
    }
    const cleaned = removeManagedCommands(definitions, isManagedCommand)
    removedManagedHook ||= definitions.some((definition) =>
      hookDefinitionHasManagedCommand(definition, isManagedCommand)
    )
    if (cleaned.length === 0) {
      delete nextHooks[eventName]
    } else {
      nextHooks[eventName] = cleaned
    }
  }

  // Why: Codex hooks moved to Yiru's managed CODEX_HOME; old entries in
  // ~/.codex would keep external Codex sessions reporting into Yiru.
  if (removedManagedHook) {
    // Why: this is the user's system hooks file, not Yiru's runtime copy.
    // Remove only stale Yiru hook entries and preserve other managers' metadata.
    const hooksWritePath = resolveHooksJsonWritePath(legacyConfigPath)
    const previousMode = statSync(hooksWritePath).mode
    mutateRealHomeHooksPreservingUserTrust({
      sourcePath: legacyConfigPath,
      runtimeHomePath: systemHomePath,
      tomlPath: getSystemCodexConfigTomlPath(),
      beforeHooks: config.hooks,
      afterHooks: nextHooks,
      writeHooks: () => {
        if (
          readFileSync(legacyConfigPath, 'utf-8') !== previousRaw ||
          resolveHooksJsonWritePath(legacyConfigPath) !== hooksWritePath
        ) {
          // Why: the pre-mutation RPC may overlap a user save; downgrade must
          // never replace that newer dotfiles generation with our stale parse.
          throw new Error('System Codex hooks changed during trust repair')
        }
        writeHooksJson(hooksWritePath, { ...config, hooks: nextHooks }, { preserveMode: true })
      },
      restoreHooks: () => writeFileAtomically(hooksWritePath, previousRaw, { mode: previousMode })
    })
    // Why: stale dev/version entries can reference an older managed script
    // path that is not represented by the current grant ledger.
    removeSelfComputedMatchingTrustEntries(getSystemCodexConfigTomlPath(), trustEntries)
  }
  if (removedManagedHook || hasRecordedRealHomeGrant) {
    // Why: the ledger recognizes Codex-computed hashes and remains a retry
    // marker if a prior cleanup removed hooks.json but could not update TOML.
    removeSystemManagedHookTrustEntries(systemHomePath, legacyConfigPath)
  }
}

export function stripLegacyManagedProfileBlock(content: string): string {
  const start = content.indexOf(LEGACY_YIRU_PROFILE_BLOCK_START)
  if (start === -1) {
    return content
  }
  const endMarker = content.indexOf(LEGACY_YIRU_PROFILE_BLOCK_END, start)
  const end = endMarker === -1 ? content.length : endMarker + LEGACY_YIRU_PROFILE_BLOCK_END.length
  const before = content.slice(0, start).replace(/[ \t]*(?:\r?\n)*$/, '')
  const after = content.slice(end).replace(/^(?:\r?\n)+/, '')
  if (!before) {
    return after
  }
  if (!after) {
    return before.endsWith('\n') ? before : `${before}\n`
  }
  return `${before}\n\n${after}`
}

export function cleanupLegacyCodexProfileHooks(): void {
  const profilePath = getLegacyCodexProfileTomlPath()
  if (!existsSync(profilePath)) {
    return
  }

  const existing = readFileSync(profilePath, 'utf-8')
  const next = stripLegacyManagedProfileBlock(existing)
  if (next === existing) {
    return
  }
  // Why: #2778 wrote Yiru hooks into a Codex profile file. Runtime CODEX_HOME
  // supersedes that representation, so remove only Yiru's marked block.
  if (next.trim().length === 0) {
    unlinkSync(profilePath)
  } else {
    writeConfigAtomically(profilePath, next)
  }
}

export function cleanupLegacyManagedHookRepresentations(): void {
  try {
    cleanupLegacySystemManagedHooks()
    cleanupLegacyCodexProfileHooks()
  } catch (error) {
    console.warn('[codex-hook-service] failed to clean legacy Codex hooks', error)
  }
}

export function removeRuntimeManagedHookTrustEntries(configPath: string): void {
  try {
    removeCodexManagedHookTrustEntries({
      tomlPath: getCodexConfigTomlPath(),
      runtimeHomePath: getYiruManagedCodexHomePath(),
      sourcePath: configPath,
      command: getManagedCommand(getManagedScriptPath()),
      managedEventLabels: CODEX_MANAGED_EVENT_LABELS,
      timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS,
      sourceUsesExplicitCodexHome: true
    })
  } catch (error) {
    // Best effort — stale trust entries are harmless once hooks.json no
    // longer references the hook. Log so a programmer error doesn't disappear silently.
    console.warn('[codex-hook-service] failed to clean trust entries', error)
  }
}

export function removeWslRuntimeManagedHookTrustEntries(
  plan: CodexWslRuntimeHookInstallPlan
): void {
  try {
    removeCodexManagedHookTrustEntries({
      tomlPath: plan.tomlPath,
      runtimeHomePath: pathWin32.dirname(plan.tomlPath),
      sourcePath: plan.trustConfigPath,
      command: wrapReadablePosixHookCommand(plan.commandScriptPath),
      managedEventLabels: CODEX_MANAGED_EVENT_LABELS,
      timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
    })
  } catch (error) {
    // Why: removing disabled WSL status hooks should be best-effort like the
    // host cleanup path; stale trust is inert once hooks.json no longer points at us.
    console.warn('[codex-hook-service] failed to clean WSL trust entries', error)
  }
}

export function removeStaleWslRuntimeManagedHookTrustEntries(
  tomlPath: string,
  desiredEntries: readonly CodexTrustEntry[],
  priorLedgerHomes: readonly CodexTrustGrantLedgerHome[] = []
): void {
  removeStaleWslCodexManagedHookTrustEntries({
    tomlPath,
    runtimeHomePath: pathWin32.dirname(tomlPath),
    desiredEntries,
    managedEventLabels: CODEX_MANAGED_EVENT_LABELS,
    timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS,
    buildManagedCommand: (linuxRuntimeHome) =>
      wrapReadablePosixHookCommand(`${linuxRuntimeHome}/.yiru/agent-hooks/codex-hook.sh`),
    priorLedgerHomes
  })
}
