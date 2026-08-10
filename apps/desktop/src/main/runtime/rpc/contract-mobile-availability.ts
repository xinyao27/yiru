import { runtimeContract, RuntimeProcedureMetaSchema } from '@yiru/runtime-protocol/contract'

// Why: the mobile pre-check in rpc.ts used to read the legacy `defineMethod`
// registry, which was complete only while every contract procedure had a
// legacy twin. Phase 6 retires those twins domain by domain, and a retired
// mobile-flagged procedure then looked "not available to mobile" instead of
// simply absent — turning a would-be `method_not_found` into a wrong
// `forbidden` for any mobile client still on legacy string dispatch. The
// contract is the surviving source of truth for that flag, so derive it here.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function collect(node: unknown, path: readonly string[], into: Set<string>): void {
  if (!isRecord(node)) {
    return
  }
  if ('~orpc' in node) {
    const definition = node['~orpc']
    if (isRecord(definition)) {
      const parsed = RuntimeProcedureMetaSchema.safeParse(definition.meta)
      if (parsed.success && parsed.data.mobile) {
        into.add(path.join('.'))
      }
    }
    return
  }
  for (const [key, child] of Object.entries(node)) {
    collect(child, [...path, key], into)
  }
}

let cached: Set<string> | null = null

/** Contract method paths (`domain.method`) whose meta declares `mobile: true`. */
export function mobileAvailableContractMethods(): Set<string> {
  const existing = cached
  if (existing) {
    return existing
  }
  const names = new Set<string>()
  collect(runtimeContract, [], names)
  cached = names
  return names
}

/**
 * Whether a legacy-dispatched method may be served to a mobile-scoped client.
 * `legacyMobile` is the retired-registry answer, kept first so a still-listed
 * method needs no contract walk.
 */
export function isMethodAvailableToMobile(method: string, legacyMobile: boolean): boolean {
  return legacyMobile || mobileAvailableContractMethods().has(method)
}
