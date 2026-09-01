import { callRuntimeOrpc, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'

import type { WindowsTerminalCapabilities } from './capabilities'

export type WindowsTerminalCapabilityLoadTarget = RuntimeClientTarget

export async function readWindowsTerminalCapabilities(
  target: WindowsTerminalCapabilityLoadTarget,
  sshConnectionId?: string | null
): Promise<WindowsTerminalCapabilities> {
  // Why: probing a remote host's shells has no transport left. Report nothing
  // available rather than answering with this machine's shells, which would let
  // the terminal pick a WSL/Git Bash launcher that does not exist over there.
  if (sshConnectionId) {
    return {
      wslAvailable: false,
      wslDistros: [],
      pwshAvailable: false,
      gitBashAvailable: false,
      hostPlatform: null,
      isLoading: false
    }
  }

  const [wslAvailable, wslDistros, pwshAvailable, gitBashAvailable, hostPlatform] =
    await Promise.all([
      callRuntimeOrpc(target, (client) => client.host.wsl.isAvailable, undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeOrpc(target, (client) => client.host.wsl.listDistros, undefined, {
        timeoutMs: 15_000
      }).catch(() => []),
      callRuntimeOrpc(target, (client) => client.host.pwsh.isAvailable, undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeOrpc(target, (client) => client.host.gitBash.isAvailable, undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeOrpc(target, (client) => client.status.get, undefined, { timeoutMs: 15_000 })
        .then((status) => status.hostPlatform ?? null)
        .catch(() => null)
    ])
  return {
    wslAvailable,
    wslDistros,
    pwshAvailable,
    gitBashAvailable,
    hostPlatform,
    isLoading: false
  }
}
