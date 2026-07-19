import type { SpoolFileTreeEntry } from '../../shared/spool/spool-operation-contract'
import type { SpoolFileHostEntry } from './spool-file-operation-host'
import { normalizeSpoolRelativePath } from './spool-worktree-containment'

export function projectSpoolFileTreeEntry(
  parent: string,
  entry: SpoolFileHostEntry
): SpoolFileTreeEntry | null {
  if (!entry.name || entry.name.includes('/') || entry.name.includes('\\')) {
    return null
  }
  const relativePath = parent ? `${parent}/${entry.name}` : entry.name
  try {
    normalizeSpoolRelativePath(relativePath)
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
