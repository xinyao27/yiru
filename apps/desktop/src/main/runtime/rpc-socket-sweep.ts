import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Why: keep this in lockstep with createRuntimeTransportMetadata(), which emits
 * `o-${pid}-${endpointSuffix}.sock` with a sanitized runtime-id suffix.
 */
const RUNTIME_SOCKET_NAME_REGEX = /^o-(\d+)-[A-Za-z0-9_-]+\.sock$/

export function sweepOrphanedRuntimeSockets(userDataPath: string, ownPid: number): void {
  let entries: string[]
  try {
    entries = readdirSync(userDataPath)
  } catch {
    // Why: first-launch userData may not exist yet; the cold-start path
    // below will create it. Nothing to sweep in that case.
    return
  }
  for (const entry of entries) {
    const match = RUNTIME_SOCKET_NAME_REGEX.exec(entry)
    if (!match) {
      continue
    }
    const pid = Number(match[1])
    if (!Number.isFinite(pid)) {
      continue
    }
    // Why: never touch the current process's socket. start() already
    // rmSync's it if it exists, but belt-and-braces — a bug in the own-pid
    // path here would rmSync a socket we're about to bind to.
    if (pid === ownPid) {
      continue
    }
    try {
      // Why: signal 0 is the POSIX liveness probe — it delivers no signal
      // but returns success iff the pid resolves AND the caller has
      // permission to signal it. ESRCH = no such process; EPERM = pid
      // exists but owned by another user, which is extremely unusual on a
      // desktop app's userData dir but we conservatively leave those
      // sockets alone.
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        try {
          rmSync(join(userDataPath, entry), { force: true })
        } catch {
          // Why: best-effort sweep — a permission error on unlink is fine
          // to ignore; the socket will be cleaned by a later start() or
          // by the OS on reboot.
        }
      }
    }
  }
}
