import { callRuntimeRpc, type RuntimeClientTarget } from '~renderer/runtime/rpc-client'
import { STATUS_GET_CONTRACT } from '~shared/runtime-method-contracts/runtime-control-contracts'

import type { WindowsTerminalCapabilities } from './windows-terminal-capabilities'

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

  if (target.kind === 'local') {
    const [wslAvailable, wslDistros, pwshAvailable, gitBashAvailable, hostPlatform] =
      await Promise.all([
        window.api.wsl.isAvailable().catch(() => false),
        window.api.wsl.listDistros().catch(() => []),
        window.api.pwsh.isAvailable().catch(() => false),
        window.api.gitBash.isAvailable().catch(() => false),
        window.api.runtime
          .getStatus()
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

  const [wslAvailable, wslDistros, pwshAvailable, gitBashAvailable, hostPlatform] =
    await Promise.all([
      callRuntimeRpc<boolean>(target, 'host.wsl.isAvailable', undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeRpc<string[]>(target, 'host.wsl.listDistros', undefined, {
        timeoutMs: 15_000
      }).catch(() => []),
      callRuntimeRpc<boolean>(target, 'host.pwsh.isAvailable', undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeRpc<boolean>(target, 'host.gitBash.isAvailable', undefined, {
        timeoutMs: 15_000
      }).catch(() => false),
      callRuntimeRpc(target, STATUS_GET_CONTRACT, undefined, { timeoutMs: 15_000 })
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
