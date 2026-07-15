import { randomBytes } from 'node:crypto'

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

  reconcile(bindings: readonly SpoolCatalogReferenceBinding[]): void {
    const nextReferences = new Map<string, string>()
    const nextBindings = new Map<string, SpoolCatalogReferenceBinding>()
    const reservedReferences = new Set<string>()
    for (const binding of bindings) {
      const reference =
        nextReferences.get(binding.aliasKey) ??
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

  invalidateInstance(instanceId: string): void {
    this.reconcile(
      [...this.bindingByReference.values()].filter(
        (binding) => binding.kind === 'project' || binding.instanceId !== instanceId
      )
    )
  }

  clear(): void {
    this.referenceByAliasKey.clear()
    this.bindingByReference.clear()
  }

  private createReference(reservedReferences: ReadonlySet<string>): string {
    let reference: string
    do {
      reference = randomBytes(16).toString('base64url')
    } while (this.bindingByReference.has(reference) || reservedReferences.has(reference))
    return reference
  }
}
