import { type, type ContractRouter } from '@orpc/contract'
import { z } from 'zod'

import type { RuntimeHostPlatformName } from '../status.js'
import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'

// Registering the `yiru` command belongs to the machine that will run it, so a
// paired client managing a remote host needs this surface — before it existed,
// the web face could only report `unsupported`.

export type RuntimeCliInstallState =
  | 'installed'
  | 'not_installed'
  | 'stale'
  | 'conflict'
  | 'unsupported'

export type RuntimeCliInstallUnsupportedReason =
  | 'platform_not_supported'
  | 'launcher_missing'
  | 'launch_mode_unavailable'

export type RuntimeCliInstallMethod = 'symlink' | 'wrapper'

export type RuntimeCliInstallStatus = {
  platform: RuntimeHostPlatformName
  commandName: string
  commandPath: string | null
  pathDirectory: string | null
  pathConfigured: boolean
  launcherPath: string | null
  installMethod: RuntimeCliInstallMethod | null
  supported: boolean
  state: RuntimeCliInstallState
  currentTarget: string | null
  unsupportedReason: RuntimeCliInstallUnsupportedReason | null
  detail: string | null
}

export const CliEmptyInputSchema = z.object({})

// Why: an absent distro means "the host's default WSL distro" — a meaning the
// callers rely on — so null and undefined must both survive validation.
export const CliWslInputSchema = z.object({
  distro: z.string().nullable().optional()
})

export type CliWslInput = z.output<typeof CliWslInputSchema>

export const CLI_INSTALL_STATUS_CONTRACT = {
  name: 'cli.installStatus',
  params: CliEmptyInputSchema,
  mobile: false
} as const

export const CLI_INSTALL_CONTRACT = {
  name: 'cli.install',
  params: CliEmptyInputSchema,
  mobile: false
} as const

export const CLI_REMOVE_CONTRACT = {
  name: 'cli.remove',
  params: CliEmptyInputSchema,
  mobile: false
} as const

export const CLI_WSL_INSTALL_STATUS_CONTRACT = {
  name: 'cli.wslInstallStatus',
  params: CliWslInputSchema,
  mobile: false
} as const

export const CLI_WSL_INSTALL_CONTRACT = {
  name: 'cli.wslInstall',
  params: CliWslInputSchema,
  mobile: false
} as const

export const CLI_WSL_REMOVE_CONTRACT = {
  name: 'cli.wslRemove',
  params: CliWslInputSchema,
  mobile: false
} as const

const HOST_READ_ACCESS = { scope: 'host', tier: 'read' } as const
// Why: installing writes a launcher onto the host and edits its PATH
// configuration — host tier, not control.
const HOST_HOST_ACCESS = { scope: 'host', tier: 'host' } as const

export const cliContract = {
  installStatus: withAccess(HOST_READ_ACCESS)
    .input(CliEmptyInputSchema)
    .output(type<RuntimeCliInstallStatus>()),
  install: withAccess(HOST_HOST_ACCESS)
    .input(CliEmptyInputSchema)
    .output(type<RuntimeCliInstallStatus>()),
  remove: withAccess(HOST_HOST_ACCESS)
    .input(CliEmptyInputSchema)
    .output(type<RuntimeCliInstallStatus>()),
  wslInstallStatus: withAccess(HOST_READ_ACCESS)
    .input(CliWslInputSchema)
    .output(type<RuntimeCliInstallStatus>()),
  wslInstall: withAccess(HOST_HOST_ACCESS)
    .input(CliWslInputSchema)
    .output(type<RuntimeCliInstallStatus>()),
  wslRemove: withAccess(HOST_HOST_ACCESS)
    .input(CliWslInputSchema)
    .output(type<RuntimeCliInstallStatus>())
} satisfies ContractRouter<RuntimeProcedureMeta>
