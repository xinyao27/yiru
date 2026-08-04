import { posix } from 'node:path'

import { parseWslUncPath } from '@yiru/workbench-model/platform'

import { gitExecFileAsync } from '../git/runner'
import { requireSingleCoworkingGitPath, toCoworkingLocalAccessPath } from './canonical-host-path'
import type { CoworkingCanonicalHostPath } from './worktree-containment'
import { coworkingHostPath } from './yiru-host/paths'

const GIT_ADMIN_PATH_TIMEOUT_MS = 10_000
const GIT_ADMIN_PATH_MAX_BUFFER_BYTES = 64 * 1024

/** Resolves Git's per-worktree and common administrative roots on the actual host. */
export async function readCoworkingGitAdministrativePaths(
  root: CoworkingCanonicalHostPath
): Promise<readonly string[]> {
  const outputs = await readLocalGitAdministrativePaths(root.absolutePath)
  return outputs.map((value) => resolveGitOutputPath(root, value))
}

async function readLocalGitAdministrativePaths(cwd: string): Promise<readonly string[]> {
  const execute = async (arg: '--absolute-git-dir' | '--git-common-dir'): Promise<string> =>
    requireSingleCoworkingGitPath(
      (
        await gitExecFileAsync(['rev-parse', arg], {
          cwd,
          timeout: GIT_ADMIN_PATH_TIMEOUT_MS,
          maxBuffer: GIT_ADMIN_PATH_MAX_BUFFER_BYTES
        })
      ).stdout
    )
  return await Promise.all([execute('--absolute-git-dir'), execute('--git-common-dir')])
}

function resolveGitOutputPath(root: CoworkingCanonicalHostPath, value: string): string {
  const wsl = parseWslUncPath(root.absolutePath)
  if (wsl) {
    const linuxPath = posix.isAbsolute(value)
      ? posix.normalize(value)
      : posix.resolve(wsl.linuxPath, value)
    return toCoworkingLocalAccessPath(linuxPath, wsl.distro)
  }
  const pathApi = coworkingHostPath(root)
  return pathApi.isAbsolute(value)
    ? pathApi.normalize(value)
    : pathApi.resolve(root.absolutePath, value)
}
