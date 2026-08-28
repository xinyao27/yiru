import { isLazy, isProcedure } from '@orpc/server'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Why: a `runtimeContract` leaf is a declarative `ContractProcedure` built by
// `withAccess()` — it carries the internal `~orpc` definition but, unlike a
// real implementation, never gains a callable handler. Duck-typing that
// marker mirrors `router-bridge.ts`'s own check on implementer nodes, and
// keeps this module free of a direct `@orpc/contract` dependency.
function isContractLeaf(node: unknown): boolean {
  return isRecord(node) && '~orpc' in node
}

function assertNode(router: unknown, contract: unknown, path: readonly string[]): void {
  if (isContractLeaf(contract)) {
    if (isLazy(router)) {
      throw new Error(`runtime_orpc_lazy_router_unsupported:${path.join('.')}`)
    }
    if (!isProcedure(router)) {
      throw new Error(`incomplete_runtime_orpc_router:${path.join('.')}`)
    }
    return
  }
  if (!isRecord(contract)) {
    throw new Error(`invalid_runtime_orpc_contract:${path.join('.')}`)
  }
  if (isLazy(router)) {
    throw new Error(`runtime_orpc_lazy_router_unsupported:${path.join('.')}`)
  }
  if (!isRecord(router)) {
    throw new Error(`incomplete_runtime_orpc_router:${path.join('.')}`)
  }
  for (const key of Object.keys(contract)) {
    assertNode(router[key], contract[key], [...path, key])
  }
}

// Why: `router-bridge.ts` currently guarantees at startup that every
// `runtimeContract` leaf has a legacy handler, by throwing
// `missing_runtime_rpc_method` while walking the implementer tree. Phase 6
// deletes that bridge and its legacy registry lookup, which would otherwise
// degrade the guarantee from "fails at boot" to "fails only when a client
// calls the unwired procedure". This walks the *built* router object
// directly against the contract shape instead, so the boot-time guarantee
// survives the bridge's removal regardless of how each domain ends up wired.
export function assertRuntimeOrpcRouterComplete(router: unknown, contract: unknown): void {
  assertNode(router, contract, [])
}
