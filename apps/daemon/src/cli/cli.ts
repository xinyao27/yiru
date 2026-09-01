import type { CliInstallStatus } from '@yiru/runtime-protocol/workbench/cli-install-types'
import { getDefaultWslDistro } from '~main/hosts/capabilities'

import { getCanonicalUserDataPath } from '../persistence/data-path'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'
import { CliInstaller } from './installer'
import { WslCliInstaller } from './wsl-cli-installer'
import { runSerializedWslCliRegistrationOperation } from './wsl-cli-registration-operation'
import {
  recordWslCliRegistrationInstalled,
  recordWslCliRegistrationRemoved
} from './wsl-cli-registration-registry'

function normalizeWslCliDistro(args?: { distro?: string | null }): string | undefined {
  return args?.distro?.trim() || undefined
}

function resolveWslCliDistro(args?: { distro?: string | null }): string | null {
  return normalizeWslCliDistro(args) ?? getDefaultWslDistro()
}

function runWslCliRegistrationOperation<T>(
  distro: string | null,
  operation: () => Promise<T>
): Promise<T> {
  return distro ? runSerializedWslCliRegistrationOperation(distro, operation) : operation()
}

async function persistWslCliRegistration(
  operation: () => Promise<void>,
  action: 'install' | 'remove'
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    // Why: the WSL file operation already succeeded; advisory metadata must
    // not turn that success into a false Settings failure. The atomic write
    // left the prior registry intact, and repair is disk-authoritative, so a
    // stale entry self-corrects on the next startup probe.
    console.warn(
      `[wsl-cli] Failed to persist ${action} registration metadata:`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

async function hydrateLocalShellPathForCli(force = false): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  // Why: CLI registration must match `which yiru` in the user's terminal, not
  // the sparse PATH a service process inherited from launchd.
  const hydration = await hydrateShellPath(force ? { force: true } : undefined)
  if (hydration.ok) {
    mergePathSegments(hydration.segments)
  }
}

export async function getCliInstallStatus(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli()
  return new CliInstaller().getStatus()
}

export async function installCli(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli(true)
  return new CliInstaller().install()
}

export async function removeCli(): Promise<CliInstallStatus> {
  await hydrateLocalShellPathForCli()
  return new CliInstaller().remove()
}

// Why: status is a read-only probe; queuing it behind a long-running
// repair/install would hang the Settings spinner for its duration, and
// Settings re-polls, so a rare transient read self-corrects.
export async function getWslCliInstallStatus(args?: {
  distro?: string | null
}): Promise<CliInstallStatus> {
  return new WslCliInstaller({ distro: resolveWslCliDistro(args) }).getStatus()
}

export async function installWslCli(args?: { distro?: string | null }): Promise<CliInstallStatus> {
  const distro = resolveWslCliDistro(args)
  return runWslCliRegistrationOperation(distro, async () => {
    const status = await new WslCliInstaller({ distro }).install()
    if (distro && status.state === 'installed') {
      await persistWslCliRegistration(
        () => recordWslCliRegistrationInstalled(getCanonicalUserDataPath(), distro),
        'install'
      )
    }
    return status
  })
}

export async function removeWslCli(args?: { distro?: string | null }): Promise<CliInstallStatus> {
  const distro = resolveWslCliDistro(args)
  return runWslCliRegistrationOperation(distro, async () => {
    const status = await new WslCliInstaller({ distro }).remove()
    if (distro && status.state === 'not_installed') {
      await persistWslCliRegistration(
        () => recordWslCliRegistrationRemoved(getCanonicalUserDataPath(), distro),
        'remove'
      )
    }
    return status
  })
}
