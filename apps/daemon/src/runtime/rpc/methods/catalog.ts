import type { RpcAnyMethod } from '../core'
import { CLIENT_EVENT_METHODS } from './client-events'
import { ORCHESTRATION_METHODS } from './orchestration/methods'
import { SESSION_TAB_METHODS } from './session-tabs'

// Why: every runtime contract domain is wired directly into the oRPC router.
// These empty compatibility manifests remain as explicit inputs until the
// legacy dispatcher itself is retired; they expose no renderer transport.
export const ALL_RPC_METHODS: readonly RpcAnyMethod[] = [
  ...ORCHESTRATION_METHODS,
  ...SESSION_TAB_METHODS,
  ...CLIENT_EVENT_METHODS
]
