import { randomBytes } from 'node:crypto'

const MAX_PINNED_SESSION_REFERENCES = 2_000

export type SpoolCatalogReferenceBinding =
  | { kind: 'project'; aliasKey: string; projectKey: string }
  | {
      kind: 'worktree'
      aliasKey: string
      worktreeId: string
      instanceId: string
      shareEpoch: string
    }
  | {
      kind: 'session'
      aliasKey: string
      worktreeId: string
      instanceId: string
      shareEpoch: string
      sessionKey: string
      catalogRevision: number
      generation: number
    }
  | {
      kind: 'session-page'
      aliasKey: string
      worktreeId: string
      instanceId: string
      shareEpoch: string
      pageIndex: number
      sourceCursor: string | null
      catalogRevision: number
      generation: number
    }

export class SpoolCatalogReferenceTable {
  private readonly referenceByAliasKey = new Map<string, string>()
  private readonly bindingByReference = new Map<string, SpoolCatalogReferenceBinding>()
  private readonly pinnedSessionReferences = new Map<string, string>()

  reconcile(bindings: readonly SpoolCatalogReferenceBinding[]): void {
    const nextReferences = new Map<string, string>()
    const nextBindings = new Map<string, SpoolCatalogReferenceBinding>()
    const reservedReferences = new Set<string>()
    for (const binding of bindings) {
      const reference =
        nextReferences.get(binding.aliasKey) ??
        this.pinnedSessionReferences.get(binding.aliasKey) ??
        this.referenceByAliasKey.get(binding.aliasKey) ??
        this.createReference(reservedReferences)
      nextReferences.set(binding.aliasKey, reference)
      nextBindings.set(reference, binding)
      reservedReferences.add(reference)
    }
    this.referenceByAliasKey.clear()
    this.bindingByReference.clear()
    for (const [key, reference] of nextReferences) {
      this.referenceByAliasKey.set(key, reference)
    }
    for (const [reference, binding] of nextBindings) {
      this.bindingByReference.set(reference, binding)
    }
  }

  referenceFor(aliasKey: string): string {
    const reference = this.referenceByAliasKey.get(aliasKey)
    if (!reference) {
      throw new Error('Missing Spool catalog reference')
    }
    return reference
  }

  resolve(reference: string): SpoolCatalogReferenceBinding | null {
    return this.bindingByReference.get(reference) ?? null
  }

  pinSession(reference: string): boolean {
    const binding = this.bindingByReference.get(reference)
    if (binding?.kind !== 'session') {
      return false
    }
    this.pinnedSessionReferences.delete(binding.aliasKey)
    this.pinnedSessionReferences.set(binding.aliasKey, reference)
    while (this.pinnedSessionReferences.size > MAX_PINNED_SESSION_REFERENCES) {
      const oldest = this.pinnedSessionReferences.keys().next().value
      if (!oldest) {
        break
      }
      this.pinnedSessionReferences.delete(oldest)
    }
    return true
  }

  invalidateInstance(instanceId: string): void {
    for (const [aliasKey, reference] of this.pinnedSessionReferences) {
      const binding = this.bindingByReference.get(reference)
      if (binding && binding.kind !== 'project' && binding.instanceId === instanceId) {
        this.pinnedSessionReferences.delete(aliasKey)
      }
    }
    this.reconcile(
      [...this.bindingByReference.values()].filter(
        (binding) => binding.kind === 'project' || binding.instanceId !== instanceId
      )
    )
  }

  clear(): void {
    this.referenceByAliasKey.clear()
    this.bindingByReference.clear()
    this.pinnedSessionReferences.clear()
  }

  private createReference(reservedReferences: ReadonlySet<string>): string {
    let reference: string
    do {
      reference = randomBytes(16).toString('base64url')
    } while (
      this.bindingByReference.has(reference) ||
      reservedReferences.has(reference) ||
      this.isPinnedSessionReference(reference)
    )
    return reference
  }

  private isPinnedSessionReference(reference: string): boolean {
    for (const pinned of this.pinnedSessionReferences.values()) {
      if (pinned === reference) {
        return true
      }
    }
    return false
  }
}
