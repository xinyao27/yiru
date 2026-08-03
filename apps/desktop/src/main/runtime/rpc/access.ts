// Why: every RPC method declares the authority it requires so the dispatcher can
// adjudicate one place instead of each handler re-deriving it. Handlers must not
// contain authorization logic — if a check is missing here, it is a contract bug.

/**
 * What the method reaches.
 *
 * - `worktree` — bounded by one worktree, identified by the request params.
 * - `project`  — bounded by a repo/project and the worktrees under it.
 * - `host`     — not bounded by any workspace; touches the machine itself.
 */
export type RpcAccessScope = 'worktree' | 'project' | 'host'

/**
 * What the method does within that scope.
 *
 * - `read`    — returns data, mutates no host state.
 * - `control` — mutates workspace content, or executes code scoped to a workspace.
 * - `host`    — affects the machine beyond any single workspace.
 */
export type RpcAccessTier = 'read' | 'control' | 'host'

/**
 * Which admission path a caller arrived through.
 *
 * Orthogonal to scope and tier: those describe *what* is reached and *how
 * hard*, this describes *who may ask at all*. A Coworking principal holding a
 * legitimate worktree grant satisfies `{ worktree, control }` exactly, so
 * scope+tier alone cannot express "paired runtime only".
 */
export type RpcCallerClass = 'local' | 'mobile' | 'runtime' | 'coworking-host'

export type RpcAccess = {
  scope: RpcAccessScope
  tier: RpcAccessTier
  /**
   * Optional narrowing. Absent means "any caller that satisfies scope and
   * tier" — which is never wider than the required declaration above, so
   * unlike `scope`/`tier` a missing value cannot silently grant anything.
   */
  principals?: readonly RpcCallerClass[]
}

export function callerClassOf(
  principal: { kind: 'paired-device'; scope: string } | { kind: 'coworking' } | undefined
): RpcCallerClass {
  if (!principal) {
    // Why: in-process callers (desktop IPC, CLI over the local socket) have no
    // transport-established identity and are trusted as the owner themselves.
    return 'local'
  }
  if (principal.kind === 'coworking') {
    return 'coworking-host'
  }
  switch (principal.scope) {
    case 'mobile':
      return 'mobile'
    case 'coworking-host':
      return 'coworking-host'
    default:
      return 'runtime'
  }
}

export function principalsSatisfy(access: RpcAccess, caller: RpcCallerClass): boolean {
  return access.principals === undefined || access.principals.includes(caller)
}

// Why: a caller holding tier N may invoke anything at or below N. Kept as an
// explicit order rather than comparing string literals at each call site.
const TIER_ORDER: readonly RpcAccessTier[] = ['read', 'control', 'host']

export function isRpcAccessTier(value: unknown): value is RpcAccessTier {
  return typeof value === 'string' && (TIER_ORDER as readonly string[]).includes(value)
}

export function tierSatisfies(granted: RpcAccessTier, required: RpcAccessTier): boolean {
  return TIER_ORDER.indexOf(granted) >= TIER_ORDER.indexOf(required)
}

// Why: scope widens the same way — a host-scoped grant covers project and
// worktree requests against that host, but not the reverse.
const SCOPE_ORDER: readonly RpcAccessScope[] = ['worktree', 'project', 'host']

export function scopeSatisfies(granted: RpcAccessScope, required: RpcAccessScope): boolean {
  return SCOPE_ORDER.indexOf(granted) >= SCOPE_ORDER.indexOf(required)
}

export function accessSatisfies(granted: RpcAccess, required: RpcAccess): boolean {
  return scopeSatisfies(granted.scope, required.scope) && tierSatisfies(granted.tier, required.tier)
}
