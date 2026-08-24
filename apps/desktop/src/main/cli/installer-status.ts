import { basename, dirname, join } from 'node:path'

import type { CliInstallStatus } from '~shared/cli-install-types'

import {
  isLinuxAppImage,
  isWindowsPackagedBundledCommand,
  resolveInstallSpec,
  resolveLauncherPath,
  type CliInstallContext,
  type InstallSpec
} from './installer-context'
import {
  inspectAppImageWrapper,
  inspectSymlink,
  inspectWindowsWrapper
} from './installer-inspection'
import {
  isExecutableFile,
  samePathEntry,
  splitPathEntries,
  uniquePathEntries
} from './installer-path'

export async function getCliInstallStatus(context: CliInstallContext): Promise<CliInstallStatus> {
  const defaultSpec = resolveInstallSpec(context)
  if (!defaultSpec) {
    return {
      platform: context.platform,
      commandName: context.commandName,
      commandPath: null,
      pathDirectory: null,
      pathConfigured: false,
      launcherPath: null,
      installMethod: null,
      supported: false,
      state: 'unsupported',
      currentTarget: null,
      unsupportedReason: 'platform_not_supported',
      detail: 'CLI registration is not implemented on this platform.'
    }
  }
  const launcherPath = await resolveLauncherPath(context)
  if (!launcherPath) {
    const detail =
      isLinuxAppImage(context) && context.appImagePath
        ? `The AppImage file at ${context.appImagePath} is missing. Move it back or re-run CLI registration from the current AppImage location.`
        : context.isPackaged
          ? 'The bundled CLI launcher is missing from this Yiru build.'
          : 'Development mode uses a generated launcher for validation only.'
    return {
      platform: context.platform,
      commandName: context.commandName,
      commandPath: defaultSpec.commandPath,
      pathDirectory: dirname(defaultSpec.commandPath),
      pathConfigured: false,
      launcherPath: null,
      installMethod: defaultSpec.installMethod,
      supported: false,
      state: 'unsupported',
      currentTarget: null,
      unsupportedReason: context.isPackaged ? 'launcher_missing' : 'launch_mode_unavailable',
      detail
    }
  }
  const spec = await resolveActiveInstallSpec(context, defaultSpec, launcherPath)
  const baseStatus =
    spec.installMethod === 'symlink'
      ? await inspectSymlink(context, spec.commandPath, launcherPath)
      : isLinuxAppImage(context)
        ? await inspectAppImageWrapper(context, spec.commandPath, launcherPath)
        : await inspectWindowsWrapper(context, spec.commandPath, launcherPath)
  const pathDirectory = dirname(spec.commandPath)
  return withPathInfo(
    context,
    baseStatus,
    pathDirectory,
    await isPathConfigured(context, pathDirectory)
  )
}

async function resolveActiveInstallSpec(
  context: CliInstallContext,
  defaultSpec: InstallSpec,
  launcherPath: string
): Promise<InstallSpec> {
  if (
    context.commandPathOverride ||
    context.platform !== 'darwin' ||
    defaultSpec.installMethod !== 'symlink'
  ) {
    return defaultSpec
  }
  const activeCommandPath = await findActivePathCommand(
    context,
    launcherPath,
    defaultSpec.commandPath
  )
  return activeCommandPath
    ? { commandPath: activeCommandPath, installMethod: defaultSpec.installMethod }
    : defaultSpec
}

async function findActivePathCommand(
  context: CliInstallContext,
  launcherPath: string,
  defaultCommandPath: string
): Promise<string | null> {
  let reachedDefaultCommandPath = false
  for (const commandPath of getPathCommandCandidates(context, defaultCommandPath)) {
    const isDefault = samePathEntry(context.platform, commandPath, defaultCommandPath)
    reachedDefaultCommandPath ||= isDefault
    if (!(await isExecutableFile(commandPath))) {
      continue
    }
    const status = await inspectSymlink(context, commandPath, launcherPath)
    if (status.state === 'not_installed') {
      continue
    }
    if (reachedDefaultCommandPath && !isDefault && status.state === 'conflict') {
      continue
    }
    // Why: shell lookup is first-match-wins, including a conflicting command shadowing Yiru.
    return commandPath
  }
  return null
}

function getPathCommandCandidates(
  context: CliInstallContext,
  defaultCommandPath: string
): string[] {
  const commandName = basename(defaultCommandPath)
  return uniquePathEntries(
    context.platform,
    splitPathEntries(context.platform, context.processPathEnv).map((entry) =>
      join(entry, commandName)
    )
  )
}

async function isPathConfigured(
  context: CliInstallContext,
  pathDirectory: string
): Promise<boolean> {
  const pathValue =
    context.platform === 'win32' ? await context.userPathReader() : context.processPathEnv
  return splitPathEntries(context.platform, pathValue).some((entry) =>
    samePathEntry(context.platform, entry, pathDirectory)
  )
}

function withPathInfo(
  context: CliInstallContext,
  status: CliInstallStatus,
  pathDirectory: string,
  pathConfigured: boolean
): CliInstallStatus {
  if (
    isWindowsPackagedBundledCommand(
      context,
      status.commandPath,
      status.launcherPath,
      samePathEntry
    ) &&
    status.state === 'installed' &&
    !pathConfigured
  ) {
    return {
      ...status,
      pathDirectory,
      pathConfigured,
      state: 'not_installed',
      currentTarget: null,
      detail: `Register ${status.commandPath} to use Yiru from Command Prompt or PowerShell.`
    }
  }
  if (status.state !== 'installed' || pathConfigured) {
    return { ...status, pathDirectory, pathConfigured }
  }
  return {
    ...status,
    pathDirectory,
    pathConfigured,
    detail:
      context.platform === 'linux'
        ? `${status.commandPath} is registered, but ${pathDirectory} is not on PATH for this shell.`
        : `${status.commandPath} is registered. Restart your shell if the command is not visible yet.`
  }
}
