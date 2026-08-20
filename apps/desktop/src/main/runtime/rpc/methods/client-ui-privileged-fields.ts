import type { RpcCallerClass } from '../access'

// Why: this module owns the client-UI fields that grant code execution on the
// owner's machine — directly (agent launch controls) or on a delay (hook trust).
// They are the highest-value writes on the RPC surface, so the caller-class
// decision for all of them lives in one place.

// Why: these three settings decide the binary, argv, and environment of every
// future agent process on the owner's machine. Reading them exports whatever
// provider API keys live in agentDefaultEnv; writing them is equivalent to
// arbitrary code execution. They are the highest-value fields on the RPC surface.
const AGENT_LAUNCH_CONTROL_KEYS = [
  'agentCmdOverrides',
  'agentDefaultArgs',
  'agentDefaultEnv'
] as const

type AgentLaunchControlKey = (typeof AGENT_LAUNCH_CONTROL_KEYS)[number]

/**
 * Whether this caller may see or set the agent launch controls.
 *
 * Why `mobile` is still allowed: the phone reads all three to rebuild a launch
 * spec when resuming a session, so redacting them here would break session
 * resume. The correct fix is to stop round-tripping the values through the
 * phone and resolve them on the host at launch time — tracked in
 * docs/coworking-unified-remote-access.md §6.8 A.
 */
function mayGrantCodeExecution(caller: RpcCallerClass): boolean {
  switch (caller) {
    case 'local':
    case 'runtime':
    case 'mobile':
      return true
    case 'coworking-host':
      return false
  }
}

export function redactAgentLaunchControls<TSettings extends Partial<Record<string, unknown>>>(
  settings: TSettings,
  caller: RpcCallerClass
): TSettings {
  if (mayGrantCodeExecution(caller)) {
    return settings
  }
  const redacted = { ...settings }
  for (const key of AGENT_LAUNCH_CONTROL_KEYS) {
    if (key in redacted) {
      // Why: emptied rather than deleted so the response keeps its declared
      // shape and clients do not have to branch on a missing field.
      redacted[key as keyof TSettings] = {} as TSettings[keyof TSettings]
    }
  }
  return redacted
}

export function assertAgentLaunchControlsWritable(
  update: Partial<Record<AgentLaunchControlKey, unknown>>,
  caller: RpcCallerClass
): void {
  if (mayGrantCodeExecution(caller)) {
    return
  }
  const attempted = AGENT_LAUNCH_CONTROL_KEYS.filter((key) => update[key] !== undefined)
  if (attempted.length === 0) {
    return
  }
  // Why: a stable snake_case code matching the existing denial convention
  // (see requirePairedRuntimePrincipal), so callers can branch on it.
  throw new Error(`agent_launch_control_forbidden:${attempted.join(',')}`)
}

/**
 * `ui.set` carries `trustedYiruHooks`, the store that marks a repo's yiru.yaml
 * hook scripts as approved to run. A write here is delayed code execution.
 *
 * Why `mobile` is allowed: the phone round-trips the whole UI record back
 * through ui.set, so rejecting the key outright would break every mobile
 * UI-state write.
 */
export function assertHookTrustWritable(
  update: Partial<Record<'trustedYiruHooks', unknown>>,
  caller: RpcCallerClass
): void {
  if (mayGrantCodeExecution(caller) || update.trustedYiruHooks === undefined) {
    return
  }
  throw new Error('hook_trust_write_forbidden')
}
