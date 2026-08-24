import { join } from 'node:path'

import { POSIX_HOOK_STDIN_DRAIN_COMMAND } from '../agent-hooks/hook-stdin-contract'
import {
  getSharedManagedScriptPath,
  wrapPosixHookCommand,
  wrapWindowsCmdHookCommand,
  writeHooksJson,
  type HookDefinition
} from '../agent-hooks/managed-hook-commands'
import type { CodexEventLabel, CodexTrustEntry } from './config-toml-trust'
import { getYiruManagedCodexHomePath, getSystemCodexHomePath } from './home-paths'
import { CODEX_HOOK_EVENT_LABEL, getCodexManagedScriptFileName } from './hook-identity'

// Why: PreToolUse/PostToolUse give the dashboard a live readout of the
// in-flight tool (name + input preview) between UserPromptSubmit and Stop.
// PermissionRequest is the human-input boundary: the managed script exits
// without a decision so Codex still shows its normal approval UI, while Yiru
// can flip the pane to the red waiting state.
export const CODEX_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop'
] as const

export function getConfigPath(runtimeHomePath: string = getYiruManagedCodexHomePath()): string {
  return join(runtimeHomePath, 'hooks.json')
}

export function writeCodexHooksJson(
  configPath: string,
  hooks: Record<string, HookDefinition[]>
): void {
  // Why: Codex rejects unknown top-level hooks.json fields, so plugin manager
  // bookkeeping such as `_managed` must not survive Yiru's rewrite.
  writeHooksJson(configPath, { hooks })
}

export function getCodexConfigTomlPath(
  runtimeHomePath: string = getYiruManagedCodexHomePath()
): string {
  return join(runtimeHomePath, 'config.toml')
}

// Why: the managed-event subset of the shared PascalCase→label map; the
// full mapping lives in hook-identity.ts so promotion can't drift.
export const CODEX_EVENT_LABEL: Record<(typeof CODEX_EVENTS)[number], CodexEventLabel> = {
  SessionStart: CODEX_HOOK_EVENT_LABEL.SessionStart!,
  UserPromptSubmit: CODEX_HOOK_EVENT_LABEL.UserPromptSubmit!,
  PreToolUse: CODEX_HOOK_EVENT_LABEL.PreToolUse!,
  PermissionRequest: CODEX_HOOK_EVENT_LABEL.PermissionRequest!,
  PostToolUse: CODEX_HOOK_EVENT_LABEL.PostToolUse!,
  SubagentStart: CODEX_HOOK_EVENT_LABEL.SubagentStart!,
  SubagentStop: CODEX_HOOK_EVENT_LABEL.SubagentStop!,
  Stop: CODEX_HOOK_EVENT_LABEL.Stop!
}

export const CODEX_MANAGED_EVENT_LABELS = new Set<CodexEventLabel>(
  CODEX_EVENTS.map((eventName) => CODEX_EVENT_LABEL[eventName])
)

export const CODEX_PLUGIN_ONLY_HOOK_PLACEHOLDERS = [
  '${CLAUDE_PLUGIN_ROOT}',
  '${CLAUDE_PLUGIN_DATA}',
  '${PLUGIN_ROOT}',
  '${PLUGIN_DATA}'
] as const

export const LEGACY_YIRU_PROFILE_NAME = 'yiru-agent-status'
export const LEGACY_YIRU_PROFILE_BLOCK_START = '# BEGIN YIRU AGENT STATUS HOOKS'
export const LEGACY_YIRU_PROFILE_BLOCK_END = '# END YIRU AGENT STATUS HOOKS'

export type MirroredRuntimeUserHookTrustEntry = {
  entry: CodexTrustEntry
  enabled: boolean
}

export function getManagedScriptPath(): string {
  return getSharedManagedScriptPath(getCodexManagedScriptFileName())
}

export function getManagedCommand(scriptPath: string): string {
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

// Why: when the real-home lane owns ~/.codex/hooks.json (system-default flag ON
// with hooks enabled), the legacy system-home sweep must stand down or every
// managed install would delete the entry the real-home installer just wrote.
// Injected as a gate because this module is bundled into plain-node CLI entries
// that have no settings store; the CLI default keeps the sweep active.
export let systemCodexHomeHookSweepSuppressed: () => boolean = () => false

export function setSystemCodexHomeHookSweepSuppressed(gate: () => boolean): void {
  systemCodexHomeHookSweepSuppressed = gate
}

export function wrapReadablePosixHookCommand(scriptPath: string): string {
  const quoted = `'${scriptPath.replaceAll("'", "'\\''")}'`
  // Why: WSL runtime hooks are written from Windows through UNC, where the
  // executable bit is not reliable; a missing script must still own stdin.
  return `if [ -f ${quoted} ] && [ -r ${quoted} ]; then /bin/sh ${quoted}; else ${POSIX_HOOK_STDIN_DRAIN_COMMAND}; fi`
}

export function getSystemConfigPath(): string {
  return join(getSystemCodexHomePath(), 'hooks.json')
}

export function getSystemCodexConfigTomlPath(): string {
  return join(getSystemCodexHomePath(), 'config.toml')
}

export function getLegacyCodexProfileTomlPath(): string {
  return join(getSystemCodexHomePath(), `${LEGACY_YIRU_PROFILE_NAME}.config.toml`)
}
