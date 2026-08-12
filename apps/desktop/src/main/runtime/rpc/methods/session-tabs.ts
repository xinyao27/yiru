import type { RpcAnyMethod } from '../core'

// Why: every `session.tabs.*` leaf is wired directly into the authenticated
// oRPC router. This empty compatibility manifest remains until the legacy
// dispatcher no longer consumes method groups.
export const SESSION_TAB_METHODS: RpcAnyMethod[] = []
