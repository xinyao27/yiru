import type { RuntimeCliInstallStatus } from '@yiru/runtime-protocol/contract'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: installing the launcher can shell out to a package manager and rewrite
// shell profiles, which comfortably outruns the default call timeout.
const CLI_INSTALL_TIMEOUT_MS = 120_000

export async function readCliInstallStatus(
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(getActiveRuntimeTarget(settings), (client) => client.cli.installStatus, {})
}

export async function installCliCommand(
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.cli.install,
    {},
    {
      timeoutMs: CLI_INSTALL_TIMEOUT_MS
    }
  )
}

export async function removeCliCommand(
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.cli.remove,
    {},
    {
      timeoutMs: CLI_INSTALL_TIMEOUT_MS
    }
  )
}

export async function readWslCliInstallStatus(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.cli.wslInstallStatus,
    { distro: args?.distro ?? null }
  )
}

export async function installWslCliCommand(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.cli.wslInstall,
    { distro: args?.distro ?? null },
    { timeoutMs: CLI_INSTALL_TIMEOUT_MS }
  )
}

export async function removeWslCliCommand(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<RuntimeCliInstallStatus> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.cli.wslRemove,
    { distro: args?.distro ?? null },
    { timeoutMs: CLI_INSTALL_TIMEOUT_MS }
  )
}
