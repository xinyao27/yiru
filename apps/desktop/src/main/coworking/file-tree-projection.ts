import type { CoworkingFileTreeEntry } from '../../shared/coworking/operation-contract'
import type { CoworkingFileHostEntry } from './file-operation-host'
import { normalizeCoworkingRelativePath } from './worktree-containment'

export function projectCoworkingFileTreeEntry(
  parent: string,
  entry: CoworkingFileHostEntry
): CoworkingFileTreeEntry | null {
  if (!entry.name || entry.name.includes('/') || entry.name.includes('\\')) {
    return null
  }
  const relativePath = parent ? `${parent}/${entry.name}` : entry.name
  try {
    normalizeCoworkingRelativePath(relativePath)
  } catch {
    return null
  }
  return {
    relativePath,
    name: entry.name,
    kind: entry.kind,
    size: Number.isSafeInteger(entry.size) && Number(entry.size) >= 0 ? (entry.size ?? null) : null,
    modifiedAt: Number.isFinite(entry.modifiedAt) ? (entry.modifiedAt ?? null) : null
  }
}
