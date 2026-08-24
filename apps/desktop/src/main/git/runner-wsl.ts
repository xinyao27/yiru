import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'

import { recordSubprocessSpawn } from '../diagnostics/main-thread-churn-probe'
import { parseWslPath, toWindowsWslPath } from '../wsl'
import { resolveCommand } from './runner-command'

export function wslAwareSpawn(
  command: string,
  args: string[],
  options: SpawnOptions & { cwd?: string; wslDistro?: string; useWslLoginShell?: boolean }
): ChildProcess {
  const { wslDistro, useWslLoginShell, ...spawnOptions } = options
  const resolved = resolveCommand(command, args, options.cwd, wslDistro, {
    useWslLoginShell
  })
  const spawnStartedAt = performance.now()
  const child = spawn(resolved.binary, resolved.args, {
    ...spawnOptions,
    cwd: resolved.cwd
  })
  recordSubprocessSpawn(resolved.binary, resolved.args, performance.now() - spawnStartedAt)
  return child
}

// ─── Path translation helpers ───────────────────────────────────────

/**
 * Translate absolute Linux paths in git output back to Windows UNC paths.
 *
 * Why: when git runs inside WSL, paths in output (e.g. `git worktree list`)
 * are Linux-native (/home/user/repo). The rest of Yiru needs Windows UNC
 * paths (\\wsl.localhost\Ubuntu\home\user\repo) to read files via Node fs.
 */
export function translateWslOutputPaths(
  output: string,
  originalCwd: string,
  options: { wslDistro?: string } = {}
): string {
  const wsl = parseWslPath(originalCwd)
  const distro = wsl?.distro ?? options.wslDistro
  if (!distro) {
    return output
  }

  // Replace absolute Linux paths that start with / and look like filesystem
  // paths in structured git output (e.g. "worktree /home/user/repo/feature")
  return output.replace(/(?<=worktree )(\/.+)$/gm, (_match, linuxPath: string) =>
    toWindowsWslPath(linuxPath, distro)
  )
}

/**
 * Get the WSL info for a path, if applicable. Convenience re-export so
 * consumers don't need to import from wsl.ts directly.
 */
export { parseWslPath, toLinuxPath, toWindowsWslPath, isWslPath } from '../wsl'
