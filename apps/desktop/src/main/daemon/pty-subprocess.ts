import { normalizePtySize } from './pty-size'
import { createDaemonPtyEnvironment } from './pty-subprocess-environment'
import { createDaemonPtyHandle } from './pty-subprocess-handle'
import { spawnDaemonPty } from './pty-subprocess-spawn'
import type { PtySubprocessOptions } from './pty-subprocess-types'
import type { SubprocessHandle } from './session'

export { checkPtySpawnHealth } from './pty-subprocess-preflight'
export type { PtySubprocessOptions } from './pty-subprocess-types'

export function createPtySubprocess(options: PtySubprocessOptions): SubprocessHandle {
  const size = normalizePtySize(options.cols, options.rows)
  const env = createDaemonPtyEnvironment(options)
  return createDaemonPtyHandle(spawnDaemonPty(options, env, size), options)
}
