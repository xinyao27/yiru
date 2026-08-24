import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export function isDescendantOrEqual(resolvedTarget: string, resolvedBase: string): boolean {
  if (resolvedTarget === resolvedBase) {
    return true
  }
  const rel = relative(resolvedBase, resolvedTarget)
  // Why: path.relative() can return an absolute path across Windows drives; that
  // must never be interpreted as a descendant, while drive casing stays valid.
  return rel !== '' && !(rel === '..' || rel.startsWith(`..${sep}`)) && !isAbsolute(rel)
}

export function isENOENT(error: unknown): boolean {
  return error instanceof Error && Reflect.get(error, 'code') === 'ENOENT'
}

export async function normalizeExistingPath(resolvedPath: string): Promise<string> {
  try {
    return resolve(await realpath(resolvedPath))
  } catch (error) {
    if (isENOENT(error)) {
      return resolvedPath
    }
    throw error
  }
}
