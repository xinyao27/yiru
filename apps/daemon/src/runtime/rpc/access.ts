import type {
  RpcAccess,
  RpcAccessScope,
  RpcAccessTier,
  RpcCallerClass
} from '@yiru/runtime-protocol/contract'

export type {
  RpcAccess,
  RpcAccessScope,
  RpcAccessTier,
  RpcCallerClass
} from '@yiru/runtime-protocol/contract'

export function callerClassOf(
  principal: { kind: 'paired-device'; scope: string } | undefined
): RpcCallerClass {
  if (!principal) {
    // Why: in-process callers (daemon bootstrap, CLI over the local socket) have no
    // transport-established identity and are trusted as the owner themselves.
    return 'local'
  }
  return principal.scope === 'mobile' ? 'mobile' : 'runtime'
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
