import {
  readHooksJson,
  removeManagedCommands,
  type HookDefinition
} from '../agent-hooks/managed-hook-commands'
import {
  codexHookSourcePathsEqual,
  computeTrustKey,
  computeTrustedHash,
  getCodexExplicitHomeHookSourcePath,
  normalizeHookTrustKeyForLookup,
  parseTrustKey,
  readHookTrustEntries,
  removeHookTrustEntries,
  type CodexTrustEntry
} from './config-toml-trust'
import type { MirroredRuntimeUserHookTrustEntry } from './hook-foundation'
import {
  getConfigPath,
  CODEX_PLUGIN_ONLY_HOOK_PLACEHOLDERS,
  getSystemConfigPath
} from './hook-foundation'
import { createCodexHookTrustEntry } from './hook-identity'
import {
  getTrustedSystemUserHookSignatures,
  collectMirroredRuntimeUserHookTrustEntries,
  dedupeHookDefinitions
} from './hook-runtime-trust'

export function collectManagedTrustEntries(
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

export function removeSelfComputedMatchingTrustEntries(
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

export function removeStaleRuntimeHookTrustEntries(
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

export function commandUsesCodexPluginOnlyPlaceholder(command: string | undefined): boolean {
  return (
    typeof command === 'string' &&
    CODEX_PLUGIN_ONLY_HOOK_PLACEHOLDERS.some((placeholder) => command.includes(placeholder))
  )
}

export function removeCodexPluginEnvironmentCommands(
  definitions: HookDefinition[]
): HookDefinition[] {
  // Why: Yiru mirrors system hooks into a plain runtime hooks.json. Plugin
  // placeholders only work for Codex plugin hook sources, so copying those
  // commands here strips the environment they require and turns them into 127s.
  return removeManagedCommands(definitions, commandUsesCodexPluginOnlyPlaceholder)
}

export function getRuntimeHooksWithSystemUserHooks(
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
