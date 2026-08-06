import { resolve as resolvePath } from 'node:path'

export function resolveRepoPathArgument(inputPath: string, cwd: string): string {
  return resolvePath(cwd, inputPath)
}
