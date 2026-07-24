import { execFile } from 'node:child_process'

export type WindowsTreeKiller = (rootPid: number) => Promise<void>

export const WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS = 5_000

/** Best-effort `taskkill /T /F`; callers retain authority over root cleanup. */
export function terminateWindowsProcessTree(
  rootPid: number,
  deps: { execFileImpl?: typeof execFile } = {}
): Promise<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    return Promise.resolve()
  }
  const run = deps.execFileImpl ?? execFile
  return new Promise((resolve) => {
    run(
      'taskkill',
      ['/pid', String(rootPid), '/T', '/F'],
      {
        // Why: a wedged native helper must not hold PTY teardown indefinitely.
        timeout: WINDOWS_PROCESS_TREE_KILL_TIMEOUT_MS,
        windowsHide: true
      },
      () => resolve()
    )
  })
}
