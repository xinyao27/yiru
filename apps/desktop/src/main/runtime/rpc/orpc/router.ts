import type { AnyRouter } from '@orpc/server'
import { runtimeContract } from '@yiru/runtime-protocol/contract'

import { runtimeImplementation } from './access-middleware'
import { bridgeRuntimeRouter } from './router-bridge'
import { assertRuntimeOrpcRouterComplete } from './router-completeness'
import { directRuntimeOrpcHandlers, DIRECTLY_WIRED_RUNTIME_DOMAINS } from './router-direct'

// Why: bridgeRuntimeRouter walks its input exhaustively and throws
// `missing_runtime_rpc_method` the moment it reaches a leaf with no legacy
// registration — so a directly-wired domain (router-direct.ts) must never
// enter that walk. Omitting its key here, then merging the direct handlers
// back in below, is what makes the legacy bridge retirable one domain at a
// time instead of all-or-nothing (docs/runtime-orpc-migration.md Phase 6).
const bridgedRuntimeImplementation = Object.fromEntries(
  Object.entries(runtimeImplementation).filter(
    ([domain]) => !DIRECTLY_WIRED_RUNTIME_DOMAINS.includes(domain)
  )
)

const runtimeOrpcHandlers: unknown = {
  ...(bridgeRuntimeRouter(bridgedRuntimeImplementation) as Record<string, unknown>),
  ...directRuntimeOrpcHandlers
}

// Why: the bridge mirrors the typed implementer one procedure at a time and
// fails at startup when a contract path has no registered legacy handler.
export const runtimeOrpcRouter: AnyRouter = runtimeImplementation.router(
  runtimeOrpcHandlers as Parameters<typeof runtimeImplementation.router>[0]
)

// Why: independent, legacy-registry-free restatement of the guarantee above —
// see router-completeness.ts. Still a no-op for bridged domains (the walk
// above already proved them complete), but for each domain listed in
// router-direct.ts this is now the *only* check standing between a typo in
// the direct wiring and a client-visible 404 — router-bridge.ts no longer
// covers those paths.
assertRuntimeOrpcRouterComplete(runtimeOrpcRouter, runtimeContract)
