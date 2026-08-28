import type { CliWslInput, RuntimeCliInstallStatus } from '@yiru/runtime-protocol/contract'
import {
  getCliInstallStatus,
  getWslCliInstallStatus,
  installCli,
  installWslCli,
  removeCli,
  removeWslCli
} from '~main/cli/cli'

// Why: D-stage pilot (docs/runtime-orpc-migration.md Phase 6) — this domain is
// wired directly against the contract in orpc/router-direct.ts instead of
// through a `defineMethod` legacy registration. These handler bodies are the
// implementation the direct wiring calls; they are intentionally plain
// functions with no RPC framing of their own.
export async function readRuntimeCliInstallStatus(): Promise<RuntimeCliInstallStatus> {
  return await getCliInstallStatus()
}

export async function installRuntimeCli(): Promise<RuntimeCliInstallStatus> {
  return await installCli()
}

export async function removeRuntimeCli(): Promise<RuntimeCliInstallStatus> {
  return await removeCli()
}

export async function readRuntimeWslCliInstallStatus(
  params: CliWslInput
): Promise<RuntimeCliInstallStatus> {
  return await getWslCliInstallStatus(params)
}

export async function installRuntimeWslCli(params: CliWslInput): Promise<RuntimeCliInstallStatus> {
  return await installWslCli(params)
}

export async function removeRuntimeWslCli(params: CliWslInput): Promise<RuntimeCliInstallStatus> {
  return await removeWslCli(params)
}
