import type { AgentHookInstallState, AgentHookInstallStatus } from '~shared/agent/hook-types'

import { MANAGED_HOOK_TIMEOUT_SECONDS, readHooksJson } from '../agent-hooks/managed-hook-commands'
import {
  computeTrustKey,
  computeTrustedHash,
  getCodexExplicitHomeHookSourcePath,
  normalizeHookTrustKeyForLookup,
  readHookTrustEntries,
  type CodexHookTrustState,
  type CodexTrustEntry
} from './config-toml-trust'
import { getYiruManagedCodexHomePath } from './home-paths'
import {
  CODEX_EVENTS,
  getConfigPath,
  getCodexConfigTomlPath,
  CODEX_EVENT_LABEL,
  getManagedScriptPath,
  getManagedCommand
} from './hook-foundation'
import { getCodexHookTrustSignature } from './hook-identity'
import { CodexHookServiceBase } from './hook-service-base'
import { getCodexLedgerTrustedHash } from './managed-trust-reconciliation'
import { readCurrentCodexTrustGrantLedgerHome } from './trust-grant-host'

export class CodexHookStatusService extends CodexHookServiceBase {
  getStatus(runtimeHomePath: string = getYiruManagedCodexHomePath()): AgentHookInstallStatus {
    return this.getStatusAfterInstall(null, runtimeHomePath)
  }

  protected getStatusAfterInstall(
    recentGrantEntries: readonly CodexTrustEntry[] | null,
    runtimeHomePath: string = getYiruManagedCodexHomePath()
  ): AgentHookInstallStatus {
    const configPath = getConfigPath(runtimeHomePath)
    const scriptPath = getManagedScriptPath()
    const config = readHooksJson(configPath)
    if (!config) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    // Why: Report `partial` when managed events are missing OR when their
    // trust entries are missing/stale. Codex 0.129+ silently drops untrusted
    // hooks, so a green status without trust verification is misleading.
    const command = getManagedCommand(scriptPath)
    const tomlPath = getCodexConfigTomlPath(runtimeHomePath)
    // Why: an unreadable config.toml (EACCES/EIO) is distinct from "file
    // absent" (which returns an empty Map without throwing). Hooks.json may
    // still be fine, so report partial with a specific reason rather than
    // collapsing to a generic error or masking it as universally-stale trust.
    let trustEntries: Map<string, CodexHookTrustState>
    let trustReadError: string | null = null
    try {
      trustEntries = readHookTrustEntries(tomlPath)
    } catch (error) {
      trustEntries = new Map()
      trustReadError = error instanceof Error ? error.message : String(error)
    }
    // Why: RPC-granted entries store Codex's own hash, which is authoritative
    // even when it differs from computeTrustedHash — that difference is the
    // drift bug class this lane exists to absorb, not a stale entry.
    // Why: install() already resolved the binary and either verified Codex's
    // hashes or wrote fallback hashes. Re-resolving PATH here doubles sync launch work.
    const ledgerHome =
      recentGrantEntries === null
        ? readCurrentCodexTrustGrantLedgerHome(runtimeHomePath, { kind: 'native' })
        : null
    const recentGrantHashes = new Map<string, { signature: string; trustedHash: string }>()
    for (const entry of recentGrantEntries ?? []) {
      if (entry.trustedHash) {
        recentGrantHashes.set(normalizeHookTrustKeyForLookup(computeTrustKey(entry)), {
          signature: getCodexHookTrustSignature(entry),
          trustedHash: entry.trustedHash
        })
      }
    }

    const missing: string[] = []
    const trustMissing: string[] = []
    const disabled: string[] = []
    const trustSourcePath = getCodexExplicitHomeHookSourcePath(configPath)
    let presentCount = 0
    for (const eventName of CODEX_EVENTS) {
      const definitions = Array.isArray(config.hooks?.[eventName]) ? config.hooks![eventName]! : []
      // Why: older installs appended this command, while current installs
      // prepend it. Picking the last match keeps status repair conservative
      // if duplicate managed definitions survive from a stale hooks.json.
      let foundGroupIndex = -1
      let foundHandlerIndex = -1
      definitions.forEach((definition, idx) => {
        const hooks = definition.hooks ?? []
        // Why: mirror the LAST-match-wins rule at the group level — if a user
        // merged hook arrays and ended up with our command at multiple indices
        // in one group, the surviving runtime entry is the last one.
        const handlerIdx = hooks.findLastIndex((hook) => hook.command === command)
        if (handlerIdx !== -1) {
          foundGroupIndex = idx
          foundHandlerIndex = handlerIdx
        }
      })
      if (foundGroupIndex === -1) {
        missing.push(eventName)
        continue
      }
      presentCount += 1
      // Why: a stale hash blocks firing the same as a missing entry, so
      // compare against the canonical hash we would write.
      // Why: capture the actual handler index — Codex's hook_key uses the
      // positional handlerIndex, and a user-merged hook array can put our
      // command at a non-zero slot, so hardcoding 0 would misreport trust.
      // Why: the managed hook is written with `timeout` (see install()), and
      // Codex folds the handler timeout into its trust hash. Hash the same
      // timeout here or status would report every managed hook as stale-trust.
      const trustInput: CodexTrustEntry = {
        sourcePath: trustSourcePath,
        eventLabel: CODEX_EVENT_LABEL[eventName],
        groupIndex: foundGroupIndex,
        handlerIndex: foundHandlerIndex,
        command,
        timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
      }
      const trustKey = computeTrustKey(trustInput)
      const validHashes = new Set([computeTrustedHash(trustInput)])
      const grantedHash = getCodexLedgerTrustedHash(ledgerHome, trustKey, trustInput)
      if (grantedHash) {
        validHashes.add(grantedHash)
      }
      const recentGrant = recentGrantHashes.get(normalizeHookTrustKeyForLookup(trustKey))
      if (
        recentGrant?.signature === getCodexHookTrustSignature(trustInput) &&
        recentGrant.trustedHash
      ) {
        validHashes.add(recentGrant.trustedHash)
      }
      const actualState = trustEntries.get(trustKey)
      if (!actualState?.trustedHash || !validHashes.has(actualState.trustedHash)) {
        trustMissing.push(eventName)
      } else if (actualState?.enabled === false) {
        disabled.push(eventName)
      }
    }
    const managedHooksPresent = presentCount > 0
    let state: AgentHookInstallState
    let detail: string | null
    if (presentCount === 0) {
      state = 'not_installed'
      // Why: surface the trust read error even when not_installed so the user
      // has actionable info if config.toml is broken.
      detail = trustReadError !== null ? `Trust entries unverifiable: ${trustReadError}` : null
    } else if (
      missing.length === 0 &&
      trustMissing.length === 0 &&
      disabled.length === 0 &&
      trustReadError === null
    ) {
      state = 'installed'
      detail = null
    } else {
      state = 'partial'
      const parts: string[] = []
      if (missing.length > 0) {
        parts.push(`Managed hook missing for events: ${missing.join(', ')}`)
      }
      if (trustReadError !== null) {
        parts.push(`Trust entries unverifiable: ${trustReadError}`)
      } else if (trustMissing.length > 0) {
        parts.push(`Trust entry missing or stale for events: ${trustMissing.join(', ')}`)
      }
      if (disabled.length > 0) {
        parts.push(`Managed hook disabled for events: ${disabled.join(', ')}`)
      }
      detail = parts.join('; ')
    }
    return { agent: 'codex', state, configPath, managedHooksPresent, detail }
  }
}
