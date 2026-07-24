/* eslint-disable max-lines -- Why: getStatus + install + remove all share the managed-command and trust-key derivation. Splitting would hide that the three operations must agree on group index, event label, and command bytes. */
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join, win32 as pathWin32 } from 'node:path'

import type { SFTPWrapper } from 'ssh2'

import type { AgentHookInstallState, AgentHookInstallStatus } from '../../shared/agent-hook-types'
import { resolveHooksJsonWritePath } from '../agent-hooks/hook-config-write-path'
import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue,
  POSIX_HOOK_STDIN_DRAIN_COMMAND
} from '../agent-hooks/hook-stdin-contract'
import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  buildWindowsAgentHookCurlPostCommand,
  getSharedManagedScriptPath,
  hookDefinitionHasManagedCommand,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  readHooksJson,
  readHooksJsonWithRaw,
  removeManagedCommands,
  wrapPosixHookCommand,
  wrapWindowsCmdHookCommand,
  writeHooksJson,
  writeManagedScript,
  type HookDefinition
} from '../agent-hooks/installer-utils'
import {
  readHooksJsonRemote,
  readTextFileRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote,
  writeTextFileRemoteAtomic
} from '../agent-hooks/installer-utils-remote'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { syncSystemConfigIntoManagedCodexHome } from './codex-config-mirror'
import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from './codex-home-paths'
import {
  CODEX_HOOK_EVENT_LABEL,
  createCodexHookTrustEntry,
  getCodexHookTrustSignature,
  getCodexManagedScriptFileName
} from './codex-hook-identity'
import { grantManagedCodexHookTrust } from './codex-hook-trust-grant'
import {
  getCodexLedgerTrustedHash,
  readCodexTrustGrantLedgerHomeForReconciliation,
  removeCodexManagedHookTrustEntries,
  removeStaleWslCodexManagedHookTrustEntries
} from './codex-managed-trust-reconciliation'
import { readCurrentCodexTrustGrantLedgerHome } from './codex-trust-grant-host'
import type { CodexTrustGrantLedgerHome } from './codex-trust-grant-ledger'
import { mutateRealHomeHooksPreservingUserTrust } from './codex-user-hook-trust-rebase'
import {
  createCodexWslRuntimeHookInstallPlan,
  type CodexWslRuntimeHookInstallPlan,
  type CodexWslRuntimeHookTarget,
  type WslCanonicalPathSettlement
} from './codex-wsl-hook-install-plan'
import {
  codexHookSourcePathsEqual,
  computeTrustKey,
  computeTrustedHash,
  escapeTomlString,
  getCodexExplicitHomeHookSourcePath,
  normalizeCodexHookSourcePath,
  normalizeCodexProjectPathForLookup,
  normalizeHookTrustKeyForLookup,
  parseTrustKey,
  readHookTrustEntries,
  removeHookTrustEntries,
  upsertHookTrustEntriesInContent,
  upsertHookTrustEntries,
  writeConfigAtomically,
  type CodexEventLabel,
  type CodexHookTrustState,
  type CodexTrustEntry
} from './config-toml-trust'
import {
  promoteCodexRuntimeHookApprovalsToSystem,
  snapshotCodexRuntimeHookTrustProvenance
} from './hook-trust-promotion'

// Why: PreToolUse/PostToolUse give the dashboard a live readout of the
// in-flight tool (name + input preview) between UserPromptSubmit and Stop.
// PermissionRequest is the human-input boundary: the managed script exits
// without a decision so Codex still shows its normal approval UI, while Yiru
// can flip the pane to the red waiting state.
const CODEX_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop'
] as const

function getConfigPath(runtimeHomePath: string = getYiruManagedCodexHomePath()): string {
  return join(runtimeHomePath, 'hooks.json')
}

function writeCodexHooksJson(configPath: string, hooks: Record<string, HookDefinition[]>): void {
  // Why: Codex rejects unknown top-level hooks.json fields, so plugin manager
  // bookkeeping such as `_managed` must not survive Yiru's rewrite.
  writeHooksJson(configPath, { hooks })
}

function getCodexConfigTomlPath(runtimeHomePath: string = getYiruManagedCodexHomePath()): string {
  return join(runtimeHomePath, 'config.toml')
}

// Why: the managed-event subset of the shared PascalCase→label map; the
// full mapping lives in codex-hook-identity.ts so promotion can't drift.
const CODEX_EVENT_LABEL: Record<(typeof CODEX_EVENTS)[number], CodexEventLabel> = {
  SessionStart: CODEX_HOOK_EVENT_LABEL.SessionStart!,
  UserPromptSubmit: CODEX_HOOK_EVENT_LABEL.UserPromptSubmit!,
  PreToolUse: CODEX_HOOK_EVENT_LABEL.PreToolUse!,
  PermissionRequest: CODEX_HOOK_EVENT_LABEL.PermissionRequest!,
  PostToolUse: CODEX_HOOK_EVENT_LABEL.PostToolUse!,
  SubagentStart: CODEX_HOOK_EVENT_LABEL.SubagentStart!,
  SubagentStop: CODEX_HOOK_EVENT_LABEL.SubagentStop!,
  Stop: CODEX_HOOK_EVENT_LABEL.Stop!
}

const CODEX_MANAGED_EVENT_LABELS = new Set<CodexEventLabel>(
  CODEX_EVENTS.map((eventName) => CODEX_EVENT_LABEL[eventName])
)

const CODEX_PLUGIN_ONLY_HOOK_PLACEHOLDERS = [
  '${CLAUDE_PLUGIN_ROOT}',
  '${CLAUDE_PLUGIN_DATA}',
  '${PLUGIN_ROOT}',
  '${PLUGIN_DATA}'
] as const

const LEGACY_YIRU_PROFILE_NAME = 'yiru-agent-status'
const LEGACY_YIRU_PROFILE_BLOCK_START = '# BEGIN YIRU AGENT STATUS HOOKS'
const LEGACY_YIRU_PROFILE_BLOCK_END = '# END YIRU AGENT STATUS HOOKS'

type MirroredRuntimeUserHookTrustEntry = {
  entry: CodexTrustEntry
  enabled: boolean
}

function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getCodexManagedScriptFileName())
}

function getManagedCommand(scriptPath: string): string {
  return process.platform === 'win32'
    ? wrapWindowsCmdHookCommand(scriptPath)
    : wrapPosixHookCommand(scriptPath)
}

export type CodexManagedHookInstallMaterial = {
  events: readonly (typeof CODEX_EVENTS)[number][]
  eventLabel: Record<(typeof CODEX_EVENTS)[number], CodexEventLabel>
  scriptPath: string
  command: string
  script: string
}

// Why: the real-home installer must byte-match the managed lane's events,
// command, and script, or trust signatures diverge between the two homes.
export function getCodexManagedHookInstallMaterial(): CodexManagedHookInstallMaterial {
  const scriptPath = getManagedScriptPath()
  return {
    events: CODEX_EVENTS,
    eventLabel: CODEX_EVENT_LABEL,
    scriptPath,
    command: getManagedCommand(scriptPath),
    script: getManagedScript()
  }
}

// Why: when the real-home lane owns ~/.codex/hooks.json (system-default flag ON
// with hooks enabled), the legacy system-home sweep must stand down or every
// managed install would delete the entry the real-home installer just wrote.
// Injected as a gate because this module is bundled into plain-node CLI entries
// that have no settings store; the CLI default keeps the sweep active.
let systemCodexHomeHookSweepSuppressed: () => boolean = () => false

export function setSystemCodexHomeHookSweepSuppressed(gate: () => boolean): void {
  systemCodexHomeHookSweepSuppressed = gate
}

export { createCodexWslRuntimeHookInstallPlan }
export type { CodexWslRuntimeHookInstallPlan }

function wrapReadablePosixHookCommand(scriptPath: string): string {
  const quoted = `'${scriptPath.replaceAll("'", "'\\''")}'`
  // Why: WSL runtime hooks are written from Windows through UNC, where the
  // executable bit is not reliable; a missing script must still own stdin.
  return `if [ -f ${quoted} ] && [ -r ${quoted} ]; then /bin/sh ${quoted}; else ${POSIX_HOOK_STDIN_DRAIN_COMMAND}; fi`
}

function getSystemConfigPath(): string {
  return join(getSystemCodexHomePath(), 'hooks.json')
}

function getSystemCodexConfigTomlPath(): string {
  return join(getSystemCodexHomePath(), 'config.toml')
}

function getLegacyCodexProfileTomlPath(): string {
  return join(getSystemCodexHomePath(), `${LEGACY_YIRU_PROFILE_NAME}.config.toml`)
}

function collectManagedTrustEntries(
  sourcePath: string,
  eventName: string,
  definitions: readonly HookDefinition[],
  isManagedCommand: (command: string | undefined) => boolean
): CodexTrustEntry[] {
  const entries: CodexTrustEntry[] = []
  definitions.forEach((definition, groupIndex) => {
    const hooks = Array.isArray(definition.hooks) ? definition.hooks : []
    hooks.forEach((hook, handlerIndex) => {
      if (!isManagedCommand(hook.command)) {
        return
      }
      const entry = createCodexHookTrustEntry(
        sourcePath,
        eventName,
        groupIndex,
        handlerIndex,
        definition,
        hook
      )
      if (entry) {
        entries.push(entry)
      }
    })
  })
  return entries
}

function removeSelfComputedMatchingTrustEntries(
  configPath: string,
  entries: readonly CodexTrustEntry[]
): void {
  if (entries.length === 0) {
    return
  }

  const existingEntries = readHookTrustEntries(configPath)
  const ownedKeys = entries
    .map((entry) => {
      const key = computeTrustKey(entry)
      return existingEntries.get(key)?.trustedHash === computeTrustedHash(entry) ? key : null
    })
    .filter((key): key is string => key !== null)
  if (ownedKeys.length > 0) {
    removeHookTrustEntries(configPath, ownedKeys)
  }
}

function removeStaleRuntimeHookTrustEntries(
  tomlPath: string,
  runtimeHooksPath: string,
  expectedEntries: readonly CodexTrustEntry[]
): void {
  const expectedHashes = new Map(
    expectedEntries.map((entry) => [
      normalizeHookTrustKeyForLookup(computeTrustKey(entry)),
      entry.trustedHash ?? computeTrustedHash(entry)
    ])
  )
  const canonicalRuntimeHooksPath = getCodexExplicitHomeHookSourcePath(runtimeHooksPath)
  const staleKeys: string[] = []
  for (const [key, state] of readHookTrustEntries(tomlPath)) {
    const parsed = parseTrustKey(key)
    if (!parsed || !codexHookSourcePathsEqual(parsed.sourcePath, canonicalRuntimeHooksPath)) {
      continue
    }
    if (expectedHashes.get(normalizeHookTrustKeyForLookup(key)) === state.trustedHash) {
      continue
    }
    staleKeys.push(key)
  }
  if (staleKeys.length > 0) {
    removeHookTrustEntries(tomlPath, staleKeys)
  }
}

function commandUsesCodexPluginOnlyPlaceholder(command: string | undefined): boolean {
  return (
    typeof command === 'string' &&
    CODEX_PLUGIN_ONLY_HOOK_PLACEHOLDERS.some((placeholder) => command.includes(placeholder))
  )
}

function removeCodexPluginEnvironmentCommands(definitions: HookDefinition[]): HookDefinition[] {
  // Why: Yiru mirrors system hooks into a plain runtime hooks.json. Plugin
  // placeholders only work for Codex plugin hook sources, so copying those
  // commands here strips the environment they require and turns them into 127s.
  return removeManagedCommands(definitions, commandUsesCodexPluginOnlyPlaceholder)
}

function getRuntimeHooksWithSystemUserHooks(
  runtimeHooks: Record<string, HookDefinition[]> | undefined,
  isManagedCommand: (command: string | undefined) => boolean,
  runtimeConfigPath: string = getConfigPath()
): {
  hooks: Record<string, HookDefinition[]>
  trustEntries: MirroredRuntimeUserHookTrustEntry[]
} {
  const systemConfigPath = getSystemConfigPath()
  if (systemConfigPath === runtimeConfigPath) {
    return { hooks: { ...runtimeHooks }, trustEntries: [] }
  }

  const systemConfig = readHooksJson(systemConfigPath)
  if (!systemConfig?.hooks) {
    return { hooks: {}, trustEntries: [] }
  }

  const nextHooks: Record<string, HookDefinition[]> = {}
  const trustedSystemHookSignatures = getTrustedSystemUserHookSignatures(
    systemConfigPath,
    systemConfig.hooks,
    isManagedCommand
  )
  for (const [eventName, systemDefinitions] of Object.entries(systemConfig.hooks)) {
    if (!Array.isArray(systemDefinitions)) {
      continue
    }

    const systemUserDefinitions = removeCodexPluginEnvironmentCommands(
      removeManagedCommands(systemDefinitions, isManagedCommand)
    )
    if (systemUserDefinitions.length === 0) {
      continue
    }

    // Why: runtime hooks are derived from the user's system hooks plus Yiru's
    // managed hooks. Reusing old runtime user-hook copies would keep deleted or
    // edited ~/.codex/hooks.json entries alive for new Yiru-launched sessions.
    nextHooks[eventName] = dedupeHookDefinitions(systemUserDefinitions)
  }

  return {
    hooks: nextHooks,
    trustEntries: collectMirroredRuntimeUserHookTrustEntries(
      runtimeConfigPath,
      nextHooks,
      trustedSystemHookSignatures,
      isManagedCommand
    )
  }
}

type TrustedSystemHookSignatureState = {
  enabled: boolean
  trustedHash: string
}

function getTrustedSystemUserHookSignatures(
  systemConfigPath: string,
  systemHooks: Record<string, HookDefinition[]>,
  isManagedCommand: (command: string | undefined) => boolean
): Map<string, TrustedSystemHookSignatureState> {
  const signatures = new Map<string, TrustedSystemHookSignatureState>()
  let trustEntries: Map<string, CodexHookTrustState>
  try {
    trustEntries = readHookTrustEntries(getSystemCodexConfigTomlPath())
  } catch (error) {
    // Why: a hand-broken system config.toml should only disable user-hook
    // trust mirroring; Yiru's managed runtime hooks can still be installed.
    console.warn('[codex-hook-service] failed to read system hook trust entries', error)
    return signatures
  }
  const trustedHashesByEvent = getTrustedSystemHookHashesByEvent(systemConfigPath, trustEntries)
  for (const [eventName, definitions] of Object.entries(systemHooks)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    definitions.forEach((definition, groupIndex) => {
      const hooks = Array.isArray(definition.hooks) ? definition.hooks : []
      hooks.forEach((hook, handlerIndex) => {
        if (isManagedCommand(hook.command)) {
          return
        }
        const entry = createCodexHookTrustEntry(
          systemConfigPath,
          eventName,
          groupIndex,
          handlerIndex,
          definition,
          hook
        )
        if (!entry) {
          return
        }
        const state = resolveTrustedSystemHookState(entry, trustEntries, trustedHashesByEvent)
        if (!state) {
          return
        }
        const signature = getCodexHookTrustSignature(entry)
        // Why: runtime deduping collapses identical system hook definitions;
        // if any duplicate remains enabled, keep the mirrored hook enabled.
        if (state.enabled || !signatures.has(signature)) {
          signatures.set(signature, state)
        }
      })
    })
  }
  return signatures
}

function resolveTrustedSystemHookState(
  entry: CodexTrustEntry,
  trustEntries: ReadonlyMap<string, CodexHookTrustState>,
  trustedHashesByEvent: ReadonlyMap<CodexEventLabel, Map<string, boolean>>
): TrustedSystemHookSignatureState | null {
  const expectedHash = computeTrustedHash(entry)
  const state = trustEntries.get(computeTrustKey(entry))
  if (state?.trustedHash === expectedHash) {
    return { enabled: state.enabled !== false, trustedHash: expectedHash }
  }
  const reorderedEnabled = trustedHashesByEvent.get(entry.eventLabel)?.get(expectedHash)
  if (reorderedEnabled !== undefined) {
    return { enabled: reorderedEnabled, trustedHash: expectedHash }
  }
  if (state?.trustedHash) {
    // Why: carry a key-matched system hash verbatim instead of dropping it as
    // stale. Codex is the authority on its own hash algorithm; recomputing
    // here is what turned #7110-style hash drift into an endless re-approval
    // loop. If the hash is genuinely stale (edited hook), Codex prompts —
    // exactly what a plain ~/.codex session would do.
    return { enabled: state.enabled !== false, trustedHash: state.trustedHash }
  }
  return null
}

function getTrustedSystemHookHashesByEvent(
  systemConfigPath: string,
  trustEntries: ReadonlyMap<string, CodexHookTrustState>
): Map<CodexEventLabel, Map<string, boolean>> {
  const trustedHashesByEvent = new Map<CodexEventLabel, Map<string, boolean>>()
  const canonicalSystemConfigPath = normalizeCodexHookSourcePath(systemConfigPath)
  for (const [key, state] of trustEntries) {
    const parsed = parseTrustKey(key)
    if (!parsed || !state.trustedHash) {
      continue
    }
    if (!codexHookSourcePathsEqual(parsed.sourcePath, canonicalSystemConfigPath)) {
      continue
    }
    let hashes = trustedHashesByEvent.get(parsed.eventLabel)
    if (!hashes) {
      hashes = new Map()
      trustedHashesByEvent.set(parsed.eventLabel, hashes)
    }
    const enabled = state.enabled !== false
    // Why: Codex trust keys include hook indices. If a user reorders hooks,
    // the hash still proves the same event+command identity was approved.
    if (enabled || !hashes.has(state.trustedHash)) {
      hashes.set(state.trustedHash, enabled)
    }
  }
  return trustedHashesByEvent
}

function collectMirroredRuntimeUserHookTrustEntries(
  runtimeConfigPath: string,
  runtimeHooks: Record<string, HookDefinition[]>,
  trustedSystemHookSignatures: ReadonlyMap<string, TrustedSystemHookSignatureState>,
  isManagedCommand: (command: string | undefined) => boolean
): MirroredRuntimeUserHookTrustEntry[] {
  if (trustedSystemHookSignatures.size === 0) {
    return []
  }

  const entries: MirroredRuntimeUserHookTrustEntry[] = []
  const trustSourcePath = getCodexExplicitHomeHookSourcePath(runtimeConfigPath)
  for (const [eventName, definitions] of Object.entries(runtimeHooks)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    definitions.forEach((definition, groupIndex) => {
      const hooks = Array.isArray(definition.hooks) ? definition.hooks : []
      hooks.forEach((hook, handlerIndex) => {
        if (isManagedCommand(hook.command)) {
          return
        }
        const entry = createCodexHookTrustEntry(
          trustSourcePath,
          eventName,
          groupIndex,
          handlerIndex,
          definition,
          hook
        )
        if (!entry) {
          return
        }
        const signature = getCodexHookTrustSignature(entry)
        const state = trustedSystemHookSignatures.get(signature)
        if (state !== undefined) {
          entries.push({
            entry: { ...entry, trustedHash: state.trustedHash },
            enabled: state.enabled
          })
        }
      })
    })
  }
  return entries
}

function moveMirroredRuntimeUserTrustAfterManagedStatusHook(
  entries: readonly MirroredRuntimeUserHookTrustEntry[]
): MirroredRuntimeUserHookTrustEntry[] {
  return entries.map(({ entry, enabled }) => {
    if (!CODEX_MANAGED_EVENT_LABELS.has(entry.eventLabel)) {
      return { entry, enabled }
    }
    return {
      entry: { ...entry, groupIndex: entry.groupIndex + 1 },
      enabled
    }
  })
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildHookTrustHeaderKeyPattern(key: string): string {
  const keyVariants = [key]
  const parsed = parseTrustKey(key)
  if (parsed && /^[A-Za-z]:[\\/]|^\\\\/.test(parsed.sourcePath)) {
    const suffix = `:${parsed.eventLabel}:${parsed.groupIndex}:${parsed.handlerIndex}`
    keyVariants.push(
      `${parsed.sourcePath.replace(/\\/g, '/')}${suffix}`,
      `${parsed.sourcePath.replace(/\//g, '\\')}${suffix}`
    )
  }
  const alternatives = [...new Set(keyVariants)].flatMap((variant) => {
    const quoted = [`"${escapeRegex(escapeTomlString(variant))}"`]
    if (!variant.includes("'")) {
      // Why: tolerate raw-backslash literal keys left by Codex/manual approval
      // while Yiru repairs mirrored runtime trust across both Windows variants.
      quoted.push(`'${escapeRegex(variant)}'`)
    }
    return quoted
  })
  return `(?:${alternatives.join('|')})`
}

function applyMirroredRuntimeUserHookTrustStates(
  tomlPath: string,
  entries: readonly MirroredRuntimeUserHookTrustEntry[]
): void {
  if (entries.length === 0 || !existsSync(tomlPath)) {
    return
  }

  const existing = readFileSync(tomlPath, 'utf-8')
  let updated = existing
  for (const { entry, enabled } of entries) {
    const headerKeyPattern = buildHookTrustHeaderKeyPattern(computeTrustKey(entry))
    const pattern = new RegExp(
      `(\\[hooks\\.state\\.${headerKeyPattern}\\]\\r?\\n[ \\t]*enabled[ \\t]*=[ \\t]*)(true|false)`,
      'g'
    )
    updated = updated.replace(pattern, `$1${enabled}`)
  }
  if (updated !== existing) {
    writeConfigAtomically(tomlPath, updated)
  }
}

function dedupeHookDefinitions(definitions: readonly HookDefinition[]): HookDefinition[] {
  const seen = new Set<string>()
  return definitions.filter((definition) => {
    const key = JSON.stringify(definition)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function removeSystemManagedHookTrustEntries(systemHomePath: string, hooksJsonPath: string): void {
  removeCodexManagedHookTrustEntries({
    tomlPath: getSystemCodexConfigTomlPath(),
    runtimeHomePath: systemHomePath,
    sourcePath: hooksJsonPath,
    command: getManagedCommand(getManagedScriptPath()),
    managedEventLabels: CODEX_MANAGED_EVENT_LABELS,
    timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
  })
}

function cleanupLegacySystemManagedHooks(): void {
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

function stripLegacyManagedProfileBlock(content: string): string {
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

function cleanupLegacyCodexProfileHooks(): void {
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

function cleanupLegacyManagedHookRepresentations(): void {
  try {
    cleanupLegacySystemManagedHooks()
    cleanupLegacyCodexProfileHooks()
  } catch (error) {
    console.warn('[codex-hook-service] failed to clean legacy Codex hooks', error)
  }
}

function removeRuntimeManagedHookTrustEntries(configPath: string): void {
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

function removeWslRuntimeManagedHookTrustEntries(plan: CodexWslRuntimeHookInstallPlan): void {
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

function removeStaleWslRuntimeManagedHookTrustEntries(
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

function getManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: see claude/hook-service.ts for rationale. The endpoint file holds
      // the live port/token for this Yiru install; sourcing it here lets a
      // surviving PTY reach the current server even though its env points at
      // the prior Yiru's coordinates.
      'if defined YIRU_AGENT_HOOK_ENDPOINT if exist "%YIRU_AGENT_HOOK_ENDPOINT%" call "%YIRU_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookCurlPostCommand('codex'),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookPayloadCapture(),
    // Why: see claude/hook-service.ts for rationale. Sourcing refreshes
    // PORT/TOKEN/ENV/VERSION from the current Yiru so a surviving PTY keeps
    // reporting after a restart.
    'load_hook_endpoint() {',
    '  endpoint_path="$1"',
    '  case "$endpoint_path" in',
    '    *.cmd)',
    // Why: Windows passes endpoint.cmd into WSL through WSLENV path translation.
    // Parse only Yiru's known assignments; cmd.exe `set` lines are not shell syntax.
    '      endpoint_cr=$(printf "\\r")',
    '      while IFS= read -r endpoint_line || [ -n "$endpoint_line" ]; do',
    '        endpoint_line=${endpoint_line%"$endpoint_cr"}',
    '        case "$endpoint_line" in',
    '          "set YIRU_AGENT_HOOK_PORT="*) YIRU_AGENT_HOOK_PORT=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_TOKEN="*) YIRU_AGENT_HOOK_TOKEN=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_ENV="*) YIRU_AGENT_HOOK_ENV=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_VERSION="*) YIRU_AGENT_HOOK_VERSION=${endpoint_line#*=} ;;',
    '        esac',
    '      done < "$endpoint_path"',
    '      ;;',
    '    *)',
    '      . "$endpoint_path" 2>/dev/null || :',
    '      ;;',
    '  esac',
    '}',
    'if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then',
    '  load_hook_endpoint "$YIRU_AGENT_HOOK_ENDPOINT"',
    'fi',
    'if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then',
    '  exit 0',
    'fi',
    'post_codex_hook() {',
    '  curl_bin="$1"',
    '  connect_timeout="${2:-0.5}"',
    '  max_time="${3:-1.5}"',
    // Why: worktreeId embeds a filesystem path, so hand-building JSON in POSIX
    // shell is not safe once a path contains quotes or newlines. Post the raw
    // hook payload plus metadata as form fields and let the receiver parse it.
    // Timeout caps best-effort hook posts if the local listener stalls.
    // Why: pipe payload to curl's stdin (`payload@-`) instead of an inline
    // `payload=$VALUE` arg, so tens-of-KB tool output stays off the curl
    // command line (EDR command-line false positives). Wire body is identical.
    '  printf \'%s\' "$payload" | "$curl_bin" -sS -X POST "http://127.0.0.1:${YIRU_AGENT_HOOK_PORT}/hook/codex" \\',
    '    --connect-timeout "$connect_timeout" --max-time "$max_time" \\',
    '    --noproxy "127.0.0.1" \\',
    '    -H "Content-Type: application/x-www-form-urlencoded" \\',
    '    -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \\',
    '    --data-urlencode "paneKey=${YIRU_PANE_KEY}" \\',
    '    --data-urlencode "tabId=${YIRU_TAB_ID}" \\',
    '    --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \\',
    '    --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \\',
    '    --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \\',
    '    --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \\',
    '    --data-urlencode "payload@-"',
    '}',
    'is_wsl_runtime() {',
    '  [ -n "$WSL_DISTRO_NAME" ] && return 0',
    '  grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease /proc/version 2>/dev/null',
    '}',
    'if post_codex_hook curl >/dev/null 2>&1; then',
    '  exit 0',
    'fi',
    'if is_wsl_runtime; then',
    '  windows_curl=$(command -v curl.exe 2>/dev/null || true)',
    '  if [ -n "$windows_curl" ] && [ -x "$windows_curl" ]; then',
    '    post_codex_hook "$windows_curl" 3 5 >/dev/null 2>&1 || true',
    '  fi',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}

function installManagedHooksIntoWslRuntime(
  plan: CodexWslRuntimeHookInstallPlan
): AgentHookInstallStatus {
  const config = readHooksJson(plan.configPath)
  if (!config) {
    return {
      agent: 'codex',
      state: 'error',
      configPath: plan.configPath,
      managedHooksPresent: false,
      detail: 'Could not parse Codex hooks.json'
    }
  }

  const isManagedCommand = createManagedCommandMatcher('codex-hook.sh')
  const command = wrapReadablePosixHookCommand(plan.commandScriptPath)
  const nextHooks = { ...config.hooks }
  const managedEvents = new Set<string>(CODEX_EVENTS)
  for (const [eventName, definitions] of Object.entries(nextHooks)) {
    if (managedEvents.has(eventName) || !Array.isArray(definitions)) {
      continue
    }
    const cleaned = removeManagedCommands(definitions, isManagedCommand)
    if (cleaned.length === 0) {
      delete nextHooks[eventName]
    } else {
      nextHooks[eventName] = cleaned
    }
  }

  const trustEntries: CodexTrustEntry[] = []
  for (const eventName of CODEX_EVENTS) {
    const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
    const cleaned = removeManagedCommands(current, isManagedCommand)
    const definition: HookDefinition = {
      hooks: [buildManagedCommandHook(command)]
    }
    nextHooks[eventName] = [definition, ...cleaned]
    trustEntries.push({
      sourcePath: plan.trustConfigPath,
      eventLabel: CODEX_EVENT_LABEL[eventName],
      groupIndex: 0,
      handlerIndex: 0,
      command,
      timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
    })
  }

  config.hooks = nextHooks
  writeManagedScript(plan.scriptPath, getManagedScript('posix'))
  writeCodexHooksJson(plan.configPath, nextHooks)
  try {
    // Why: same grant-then-fallback split as the host install — codex runs
    // inside the distro so the hash authority matches the codex the pane runs.
    const runtimeHomePath = pathWin32.dirname(plan.tomlPath)
    // Why: a successful re-grant replaces the ledger. Keep the previous
    // records long enough to prove ownership of stale canonical-path keys.
    const previousLedgerHome = readCodexTrustGrantLedgerHomeForReconciliation(runtimeHomePath)
    // Why: Codex's verified RPC write must be the final config mutation. A
    // host-side rewrite after verification can race or invalidate that grant.
    removeStaleWslRuntimeManagedHookTrustEntries(
      plan.tomlPath,
      trustEntries,
      previousLedgerHome ? [previousLedgerHome] : []
    )
    const grant = grantManagedCodexHookTrust({
      runtimeHomePath,
      tomlPath: plan.tomlPath,
      managedCommand: command,
      managedEntries: trustEntries,
      host: { kind: 'wsl', distro: plan.wslDistro, linuxRuntimeHome: plan.linuxRuntimeHome }
    })
    if (grant.lane === 'fallback') {
      // Why: WSL runtime homes may carry user hook approvals we did not rebuild
      // here; only upsert Yiru's entries instead of sweeping the whole source.
      upsertHookTrustEntries(plan.tomlPath, trustEntries)
    }
  } catch (error) {
    return {
      agent: 'codex',
      state: 'error',
      configPath: plan.configPath,
      managedHooksPresent: true,
      detail: `Hooks installed but trust entries could not be written: ${error instanceof Error ? error.message : String(error)}. Run /hooks in Codex to approve.`
    }
  }

  return {
    agent: 'codex',
    state: 'installed',
    configPath: plan.configPath,
    managedHooksPresent: true,
    detail: null
  }
}

function refreshWslRuntimeUserHooks(plan: CodexWslRuntimeHookInstallPlan): AgentHookInstallStatus {
  const config = readHooksJson(plan.configPath)
  if (!config) {
    return {
      agent: 'codex',
      state: 'error',
      configPath: plan.configPath,
      managedHooksPresent: false,
      detail: 'Could not parse Codex hooks.json'
    }
  }

  const isManagedCommand = createManagedCommandMatcher('codex-hook.sh')
  const nextHooks = { ...config.hooks }
  for (const [eventName, definitions] of Object.entries(nextHooks)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    const cleaned = removeManagedCommands(definitions, isManagedCommand)
    if (cleaned.length === 0) {
      delete nextHooks[eventName]
    } else {
      nextHooks[eventName] = cleaned
    }
  }
  writeCodexHooksJson(plan.configPath, nextHooks)
  removeWslRuntimeManagedHookTrustEntries(plan)
  try {
    // Why: the disabled path may be reached after the WSL mount root changed,
    // so cleanup cannot be scoped only to the plan's current source path.
    removeStaleWslRuntimeManagedHookTrustEntries(plan.tomlPath, [])
  } catch (error) {
    console.warn('[codex-hook-service] failed to clean stale WSL trust entries', error)
  }
  return {
    agent: 'codex',
    state: 'not_installed',
    configPath: plan.configPath,
    managedHooksPresent: false,
    detail: null
  }
}

// Why: transport failures preserve the last known-good identity, while a
// successful absence probe is strong enough to revoke trust immediately.
function getWslHookReconciliationAction(args: {
  settlement: WslCanonicalPathSettlement
  isCurrentGeneration: boolean
  installedTrustConfigPath: string | null
  resolvedTrustConfigPath: string | null
  /** Whether the synchronous install for this generation wrote trust. */
  installSucceeded: boolean
}): 'none' | 'remove' | 'reinstall' {
  if (!args.isCurrentGeneration) {
    return 'none'
  }
  if (args.settlement.status === 'missing') {
    // Why: a `missing` directory probe right after a verified install/grant is
    // a false negative — the RPC (or fallback) just wrote and read trust in
    // that home, so it exists. Revoking here would delete the fresh grant the
    // launching pane needs, resurfacing "hooks need review". A genuinely moved
    // home resolves to a different path and takes the `reinstall` branch below.
    return args.installSucceeded ? 'none' : 'remove'
  }
  if (
    args.settlement.status !== 'resolved' ||
    !args.resolvedTrustConfigPath ||
    args.resolvedTrustConfigPath === args.installedTrustConfigPath
  ) {
    return 'none'
  }
  return 'reinstall'
}

// Why: fold only the Windows-case-insensitive portion — a full lowercase would
// let case-distinct WSL runtime homes share one reconciliation generation slot.
function getWslReconciliationKey(runtimeHomePath: string): string {
  return normalizeCodexProjectPathForLookup(runtimeHomePath)
}

export class CodexHookService {
  private readonly wslReconciliationGeneration = new Map<string, number>()

  private supersedeWslReconciliation(runtimeHomePath: string | null | undefined): number {
    if (!runtimeHomePath) {
      return 0
    }
    const key = getWslReconciliationKey(runtimeHomePath)
    const generation = (this.wslReconciliationGeneration.get(key) ?? 0) + 1
    this.wslReconciliationGeneration.set(key, generation)
    return generation
  }

  installForRuntimeHome(
    runtimeHomePath: string | null | undefined,
    target?: CodexWslRuntimeHookTarget
  ): AgentHookInstallStatus | null {
    const generation = this.supersedeWslReconciliation(runtimeHomePath)
    let installedTrustConfigPath: string | null = null
    // Why: JS is single-threaded, so the synchronous install below finishes
    // before any async `wsl.exe` settlement callback runs — this flag is
    // always set by the time the callback reads it.
    let installSucceeded = false
    const onCanonicalPathSettled = (settlement: WslCanonicalPathSettlement): void => {
      if (!runtimeHomePath) {
        return
      }
      const key = getWslReconciliationKey(runtimeHomePath)
      const resolvedPlan =
        settlement.status === 'resolved'
          ? createCodexWslRuntimeHookInstallPlan(
              runtimeHomePath,
              target,
              () => settlement.canonicalPath
            )
          : null
      const action = getWslHookReconciliationAction({
        settlement,
        isCurrentGeneration: this.wslReconciliationGeneration.get(key) === generation,
        installedTrustConfigPath,
        resolvedTrustConfigPath: resolvedPlan?.trustConfigPath ?? null,
        installSucceeded
      })
      if (action === 'none') {
        return
      }
      if (action === 'remove') {
        try {
          removeStaleWslRuntimeManagedHookTrustEntries(
            pathWin32.join(runtimeHomePath, 'config.toml'),
            []
          )
        } catch (error) {
          console.warn('[codex-hook-service] failed to revoke stale WSL hook trust', error)
        }
        return
      }
      if (!resolvedPlan) {
        return
      }
      const status = installManagedHooksIntoWslRuntime(resolvedPlan)
      if (status.state === 'error') {
        console.warn('[codex-hook-service] failed to reconcile WSL hook path', status.detail)
        return
      }
      installedTrustConfigPath = resolvedPlan.trustConfigPath
      installSucceeded = status.state === 'installed'
    }
    const wslPlan = createCodexWslRuntimeHookInstallPlan(
      runtimeHomePath,
      target,
      undefined,
      onCanonicalPathSettled
    )
    installedTrustConfigPath = wslPlan?.trustConfigPath ?? null
    const status = wslPlan ? installManagedHooksIntoWslRuntime(wslPlan) : null
    installSucceeded = status?.state === 'installed'
    return status
  }

  refreshRuntimeUserHooksForRuntimeHome(
    runtimeHomePath: string | null | undefined,
    target?: CodexWslRuntimeHookTarget
  ): AgentHookInstallStatus | null {
    this.supersedeWslReconciliation(runtimeHomePath)
    const wslPlan = createCodexWslRuntimeHookInstallPlan(runtimeHomePath, target)
    return wslPlan ? refreshWslRuntimeUserHooks(wslPlan) : null
  }

  getStatus(runtimeHomePath: string = getYiruManagedCodexHomePath()): AgentHookInstallStatus {
    return this.getStatusAfterInstall(null, runtimeHomePath)
  }

  private getStatusAfterInstall(
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

  // Why: runtimeHomePath defaults to the shared managed mirror, but a managed
  // account launching against its own self-contained CODEX_HOME passes that
  // per-account home so hooks.json/config.toml/trust land where codex reads.
  install(runtimeHomePath: string = getYiruManagedCodexHomePath()): AgentHookInstallStatus {
    const configPath = getConfigPath(runtimeHomePath)
    const scriptPath = getManagedScriptPath()
    // Why: must run before this install rewrites hooks.json/config.toml —
    // approvals the user made inside Yiru-launched Codex are keyed to the
    // previous launch's runtime layout, and stale-trust cleanup below would
    // delete them once the system config stops backing them.
    promoteCodexRuntimeHookApprovalsToSystem(runtimeHomePath)
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

    // Why: match by script filename (not exact command string) so a fresh
    // install sweeps stale entries left by older builds or a different
    // Electron userData path (dev vs. prod). Without this, repeated installs
    // accumulate duplicate hook entries pointing at defunct scripts.
    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    const command = getManagedCommand(scriptPath)
    const hookPlan = getRuntimeHooksWithSystemUserHooks(config.hooks, isManagedCommand, configPath)
    const nextHooks = hookPlan.hooks
    const managedEvents = new Set<string>(CODEX_EVENTS)

    // Why: sweep managed entries out of events we no longer subscribe to
    // (e.g., PreToolUse from a prior install). Without this, users who
    // already had PreToolUse registered would keep firing stale hooks on
    // every auto-approved tool call after the app upgrade.
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (managedEvents.has(eventName)) {
        continue
      }
      if (!Array.isArray(definitions)) {
        // Why: a malformed hooks.json entry (non-array value for an event name)
        // would make removeManagedCommands throw. Skip instead — we aren't
        // going to sweep something we can't parse, and the install() for
        // managed events below still runs.
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }

    // Why: Codex 0.129+ requires a per-hook trust entry in config.toml or the
    // hook sits in the "review required" pile. We compute the trust hash for
    // each managed entry as we install it and persist it alongside hooks.json
    // so the user does not have to /hooks-approve after every install.
    const mirroredUserTrustEntries = moveMirroredRuntimeUserTrustAfterManagedStatusHook(
      hookPlan.trustEntries
    )
    const mirroredTrustEntries: CodexTrustEntry[] = mirroredUserTrustEntries.map(
      ({ entry }) => entry
    )
    const managedTrustEntries: CodexTrustEntry[] = []
    const trustSourcePath = getCodexExplicitHomeHookSourcePath(configPath)
    for (const eventName of CODEX_EVENTS) {
      const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
      const cleaned = removeManagedCommands(current, isManagedCommand)
      const definition: HookDefinition = {
        hooks: [buildManagedCommandHook(command)]
      }
      nextHooks[eventName] = [definition, ...cleaned]
      // Why: the status hook must run before user hooks so a slow
      // PostToolUse/Stop hook cannot leave the sidebar stuck on the previous
      // state while Codex visibly reports that hooks are still running.
      // timeoutSec mirrors the hook's `timeout` so the trust hash matches the
      // entry actually written to hooks.json.
      managedTrustEntries.push({
        sourcePath: trustSourcePath,
        eventLabel: CODEX_EVENT_LABEL[eventName],
        groupIndex: 0,
        handlerIndex: 0,
        command,
        timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
      })
    }
    const trustEntries: CodexTrustEntry[] = [...mirroredTrustEntries, ...managedTrustEntries]
    let recentGrantEntries: readonly CodexTrustEntry[] = []

    config.hooks = nextHooks
    writeManagedScript(scriptPath, getManagedScript())
    writeCodexHooksJson(configPath, nextHooks)
    // Why: trust entries write last so a half-write can't leave a hash
    // pointing at a hook that doesn't exist. Surface failures — without this,
    // getStatus would report green for a hook Codex won't actually fire.
    try {
      const tomlPath = getCodexConfigTomlPath(runtimeHomePath)
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      // Why: Codex is the only authority on its trust-hash algorithm, so the
      // managed entries are granted through codex app-server RPCs (verified by
      // re-list) whenever the installed CLI supports them; the granted entries
      // then carry Codex's verbatim hashes into stale cleanup so it cannot
      // delete what Codex just wrote. Mirrored user trust keeps its existing
      // verbatim-carry lane either way.
      const grant = grantManagedCodexHookTrust({
        runtimeHomePath,
        tomlPath,
        managedCommand: command,
        managedEntries: managedTrustEntries,
        host: { kind: 'native' }
      })
      if (grant.lane === 'rpc') {
        recentGrantEntries = grant.entries
        upsertHookTrustEntries(tomlPath, mirroredTrustEntries)
        removeStaleRuntimeHookTrustEntries(tomlPath, configPath, [
          ...mirroredTrustEntries,
          ...grant.entries
        ])
      } else {
        // Why: system user hook approvals are mirrored into runtime CODEX_HOME.
        // If the user later revokes approval in ~/.codex/config.toml, preserving
        // all old runtime [hooks.state.*] blocks would keep Yiru Codex trusted.
        // Upsert first so duplicate repair can preserve a disabled managed copy
        // before stale cleanup removes old managed hook keys.
        upsertHookTrustEntries(tomlPath, trustEntries)
        removeStaleRuntimeHookTrustEntries(tomlPath, configPath, trustEntries)
      }
      applyMirroredRuntimeUserHookTrustStates(tomlPath, mirroredUserTrustEntries)
    } catch (error) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: true,
        detail: `Hooks installed but trust entries could not be written: ${error instanceof Error ? error.message : String(error)}. Run /hooks in Codex to approve.`
      }
    }
    snapshotCodexRuntimeHookTrustProvenance(runtimeHomePath)
    try {
      cleanupLegacySystemManagedHooks()
      cleanupLegacyCodexProfileHooks()
    } catch (error) {
      console.warn('[codex-hook-service] failed to clean legacy Codex hooks', error)
    }
    return this.getStatusAfterInstall(recentGrantEntries, runtimeHomePath)
  }

  async installRemote(
    sftp: SFTPWrapper,
    remoteHome: string,
    options?: {
      /** Explicit CODEX_HOME dir (flat layout: hooks.json/config.toml at its
       *  root). WSL sessions read Yiru's managed runtime home, not ~/.codex —
       *  installing to the default location leaves those sessions hookless. */
      codexHomeDir?: string
      /** Skip the trust write when config.toml doesn't exist yet. The WSL
       *  runtime home's config.toml is seeded only-if-absent by the launch
       *  path; creating it here first would silently cancel that seed. A
       *  later (idempotent) reinstall upserts trust once the seed lands. */
      deferTrustUntilConfigToml?: boolean
    }
  ): Promise<AgentHookInstallStatus> {
    const codexHomeBase =
      options?.codexHomeDir?.replace(/\/$/, '') ?? `${remoteHome.replace(/\/$/, '')}/.codex`
    const remoteConfigPath = `${codexHomeBase}/hooks.json`
    const remoteTomlPath = `${codexHomeBase}/config.toml`
    const remoteScriptPath = `${remoteHome.replace(/\/$/, '')}/.yiru/agent-hooks/codex-hook.sh`
    try {
      const config = await readHooksJsonRemote(sftp, remoteConfigPath)
      if (!config) {
        return {
          agent: 'codex',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: 'Could not parse remote Codex hooks.json'
        }
      }

      const command = wrapPosixHookCommand(remoteScriptPath)
      const nextHooks = { ...config.hooks }
      const managedEvents = new Set<string>(CODEX_EVENTS)
      const isManagedCommand = createManagedCommandMatcher('codex-hook.sh')

      for (const [eventName, definitions] of Object.entries(nextHooks)) {
        if (managedEvents.has(eventName) || !Array.isArray(definitions)) {
          continue
        }
        const cleaned = removeManagedCommands(definitions, isManagedCommand)
        if (cleaned.length === 0) {
          delete nextHooks[eventName]
        } else {
          nextHooks[eventName] = cleaned
        }
      }

      const trustEntries: CodexTrustEntry[] = []
      for (const eventName of CODEX_EVENTS) {
        const current = Array.isArray(nextHooks[eventName]) ? nextHooks[eventName] : []
        const cleaned = removeManagedCommands(current, isManagedCommand)
        const definition: HookDefinition = {
          hooks: [buildManagedCommandHook(command)]
        }
        nextHooks[eventName] = [...cleaned, definition]
        trustEntries.push({
          sourcePath: remoteConfigPath,
          eventLabel: CODEX_EVENT_LABEL[eventName],
          groupIndex: cleaned.length,
          handlerIndex: 0,
          command,
          timeoutSec: MANAGED_HOOK_TIMEOUT_SECONDS
        })
      }

      config.hooks = nextHooks
      // Why: script/settings first, trust TOML last. A partial trust write
      // leaves Codex asking for approval rather than executing a missing script.
      // Why: SSH remotes use POSIX `.sh` hook paths even when Yiru itself is
      // running on Windows; never derive remote script syntax from local OS.
      await writeManagedScriptRemote(sftp, remoteScriptPath, getManagedScript('posix'))
      // Why: SSH installs edit the user's remote ~/.codex/hooks.json directly.
      // Preserve non-Yiru top-level metadata while replacing the hooks tree.
      await writeHooksJsonRemote(sftp, remoteConfigPath, { ...config, hooks: nextHooks })
      try {
        const existingTomlRaw = await readTextFileRemote(sftp, remoteTomlPath)
        if (existingTomlRaw === null && options?.deferTrustUntilConfigToml === true) {
          return {
            agent: 'codex',
            state: 'installed',
            configPath: remoteConfigPath,
            managedHooksPresent: true,
            detail: 'Trust entries deferred until config.toml is seeded by the launch path'
          }
        }
        const existingToml = existingTomlRaw ?? ''
        const updatedToml = upsertHookTrustEntriesInContent(existingToml, trustEntries)
        if (updatedToml !== existingToml) {
          await writeTextFileRemoteAtomic(sftp, remoteTomlPath, updatedToml)
        }
      } catch (error) {
        return {
          agent: 'codex',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: true,
          detail: `Hooks installed but trust entries could not be written: ${
            error instanceof Error ? error.message : String(error)
          }. Run /hooks in Codex on the remote host to approve.`
        }
      }

      return {
        agent: 'codex',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (err) {
      return {
        agent: 'codex',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail: err instanceof Error ? err.message : String(err)
      }
    }
  }

  refreshRuntimeUserHooks(
    runtimeHomePath: string = getYiruManagedCodexHomePath()
  ): AgentHookInstallStatus {
    const configPath = getConfigPath(runtimeHomePath)
    // Why: same as install() — capture in-Yiru approvals before this refresh
    // rewrites the runtime files they are keyed against.
    promoteCodexRuntimeHookApprovalsToSystem(runtimeHomePath)
    const config = readHooksJson(configPath)
    if (!config) {
      // Why: disabled launch prep used to call remove(); preserve its legacy
      // cleanup behavior even when runtime hooks.json is malformed.
      cleanupLegacyManagedHookRepresentations()
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    const hookPlan = getRuntimeHooksWithSystemUserHooks(config.hooks, isManagedCommand, configPath)
    config.hooks = hookPlan.hooks
    writeCodexHooksJson(configPath, hookPlan.hooks)

    try {
      const tomlPath = getCodexConfigTomlPath(runtimeHomePath)
      const trustEntries = hookPlan.trustEntries.map(({ entry }) => entry)
      syncSystemConfigIntoManagedCodexHome({
        runtimeHomePath,
        systemHomePath: getSystemCodexHomePath()
      })
      // Why: this path is used when Yiru status hooks are disabled. The
      // runtime CODEX_HOME should keep user hooks, but not Yiru-managed trust.
      // Write current mirrored user trust first so stale cleanup compares
      // against current hashes while deleting old managed hook keys.
      upsertHookTrustEntries(tomlPath, trustEntries)
      removeStaleRuntimeHookTrustEntries(tomlPath, configPath, trustEntries)
      applyMirroredRuntimeUserHookTrustStates(tomlPath, hookPlan.trustEntries)
    } catch (error) {
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: `User hooks refreshed but trust entries could not be written: ${error instanceof Error ? error.message : String(error)}. Run /hooks in Codex to approve.`
      }
    }
    snapshotCodexRuntimeHookTrustProvenance(runtimeHomePath)

    cleanupLegacyManagedHookRepresentations()
    return this.getStatus(runtimeHomePath)
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const configExists = existsSync(configPath)
    const config = readHooksJson(configPath)
    if (!config) {
      // Why: a malformed runtime hooks.json should not strand old hooks in
      // ~/.codex or the legacy profile after the user disables Codex hooks.
      cleanupLegacyManagedHookRepresentations()
      return {
        agent: 'codex',
        state: 'error',
        configPath,
        managedHooksPresent: false,
        detail: 'Could not parse Codex hooks.json'
      }
    }

    const nextHooks = { ...config.hooks }
    // Why: same broad matcher as install(), so remove() also cleans up stale
    // entries from older builds even if the current scriptPath has moved.
    const isManagedCommand = createManagedCommandMatcher(getCodexManagedScriptFileName())
    for (const [eventName, definitions] of Object.entries(nextHooks)) {
      if (!Array.isArray(definitions)) {
        // Why: a malformed hooks.json entry (non-array value for an event name)
        // would make removeManagedCommands throw. Skip instead — we have no
        // managed commands to remove from something we can't parse.
        continue
      }
      const cleaned = removeManagedCommands(definitions, isManagedCommand)
      if (cleaned.length === 0) {
        delete nextHooks[eventName]
      } else {
        nextHooks[eventName] = cleaned
      }
    }
    if (configExists) {
      // Why: remove() can be the only repair path for a parseable runtime file
      // whose top-level plugin metadata makes Codex reject hooks.json.
      writeCodexHooksJson(configPath, nextHooks)
    }

    // Why: also drop our trust entries so config.toml doesn't accumulate dead
    // [hooks.state."..."] blocks across install/remove cycles. Best-effort —
    // a stale entry is harmless once hooks.json no longer references it.
    removeRuntimeManagedHookTrustEntries(configPath)

    cleanupLegacyManagedHookRepresentations()

    return this.getStatus()
  }
}

export const codexHookService = new CodexHookService()
