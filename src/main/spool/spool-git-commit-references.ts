import { randomBytes } from 'node:crypto'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'

const MAX_REFERENCES_PER_CONNECTION = 2_000

type CommitBinding = {
  worktreeKey: string
  oid: string
}

export class SpoolGitCommitReferences {
  private readonly bindingsByConnection = new Map<string, Map<string, CommitBinding>>()
  private readonly referencesByConnection = new Map<string, Map<string, string>>()

  remember(
    connectionId: string,
    worktree: SpoolPublicWorktreeInstance,
    oids: readonly string[]
  ): ReadonlyMap<string, string> {
    const bindings = getOrCreate(this.bindingsByConnection, connectionId)
    const references = getOrCreate(this.referencesByConnection, connectionId)
    const worktreeKey = keyForWorktree(worktree)
    const result = new Map<string, string>()
    for (const oid of oids) {
      const bindingKey = `${worktreeKey}\0${oid}`
      let reference = references.get(bindingKey)
      if (!reference) {
        reference = createUniqueReference(bindings)
        references.set(bindingKey, reference)
        bindings.set(reference, { worktreeKey, oid })
      } else {
        const binding = bindings.get(reference)
        if (binding) {
          // Why: refs returned by this response must survive LRU trimming below.
          bindings.delete(reference)
          bindings.set(reference, binding)
        }
      }
      result.set(oid, reference)
    }
    trimOldest(bindings, references)
    return result
  }

  resolve(
    connectionId: string,
    worktree: SpoolPublicWorktreeInstance,
    reference: string
  ): string | null {
    const binding = this.bindingsByConnection.get(connectionId)?.get(reference)
    return binding?.worktreeKey === keyForWorktree(worktree) ? binding.oid : null
  }

  closeConnection(connectionId: string): void {
    this.bindingsByConnection.delete(connectionId)
    this.referencesByConnection.delete(connectionId)
  }
}

function keyForWorktree(worktree: SpoolPublicWorktreeInstance): string {
  return `${worktree.instanceId}\0${worktree.shareEpoch}`
}

function getOrCreate(
  map: Map<string, Map<string, CommitBinding>>,
  key: string
): Map<string, CommitBinding>
function getOrCreate(map: Map<string, Map<string, string>>, key: string): Map<string, string>
function getOrCreate<T>(map: Map<string, Map<string, T>>, key: string): Map<string, T> {
  let nested = map.get(key)
  if (!nested) {
    nested = new Map()
    map.set(key, nested)
  }
  return nested
}

function createUniqueReference(bindings: ReadonlyMap<string, CommitBinding>): string {
  let reference: string
  do {
    reference = randomBytes(16).toString('base64url')
  } while (bindings.has(reference))
  return reference
}

function trimOldest(bindings: Map<string, CommitBinding>, references: Map<string, string>): void {
  while (bindings.size > MAX_REFERENCES_PER_CONNECTION) {
    const oldest = bindings.entries().next().value as [string, CommitBinding] | undefined
    if (!oldest) {
      return
    }
    const [reference, binding] = oldest
    bindings.delete(reference)
    references.delete(`${binding.worktreeKey}\0${binding.oid}`)
  }
}
