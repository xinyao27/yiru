import { mkdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { CliInstallStatus } from '@yiru/runtime-protocol/workbench/cli-install-types'

import { isWindowsPackagedBundledCommand, type CliInstallContext } from './installer-context'
import { buildWindowsForwarder } from './installer-launchers'
import {
  isPermissionError,
  isWindowsUserPathPermissionError,
  quoteShell,
  samePathEntry,
  splitPathEntries
} from './installer-path'
import { getCliInstallStatus } from './installer-status'

export async function installCli(context: CliInstallContext): Promise<CliInstallStatus> {
  const status = await getCliInstallStatus(context)
  if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
    throw new Error(status.detail ?? 'CLI registration is unavailable on this build.')
  }
  if (status.state === 'conflict') {
    throw new Error(`Refusing to replace non-Yiru command at ${status.commandPath}.`)
  }
  if (status.installMethod === 'symlink') {
    await installSymlink(context, status.commandPath, status.launcherPath, status.state)
  } else if (
    !isWindowsPackagedBundledCommand(
      context,
      status.commandPath,
      status.launcherPath,
      samePathEntry
    )
  ) {
    await mkdir(dirname(status.commandPath), { recursive: true })
    await writeFile(status.commandPath, buildWindowsForwarder(status.launcherPath), 'utf8')
  }
  if (context.platform === 'win32') {
    await ensureWindowsPathEntry(context, dirname(status.commandPath))
  }
  return getCliInstallStatus(context)
}

export async function removeCli(context: CliInstallContext): Promise<CliInstallStatus> {
  const status = await getCliInstallStatus(context)
  if (!status.supported || !status.commandPath || !status.launcherPath || !status.installMethod) {
    return status
  }
  if (status.state === 'not_installed') {
    if (context.platform === 'win32') {
      await removeWindowsPathEntry(context, dirname(status.commandPath))
      return getCliInstallStatus(context)
    }
    return status
  }
  if (status.state === 'conflict') {
    throw new Error(`Refusing to remove non-Yiru command at ${status.commandPath}.`)
  }
  if (status.state === 'stale') {
    throw new Error(`Refusing to remove a command not owned by Yiru at ${status.commandPath}.`)
  }
  if (status.installMethod === 'symlink') {
    await removeSymlink(context, status.commandPath)
  } else if (
    isWindowsPackagedBundledCommand(context, status.commandPath, status.launcherPath, samePathEntry)
  ) {
    await removeWindowsPathEntry(context, dirname(status.commandPath))
  } else {
    await unlink(status.commandPath)
    await removeWindowsPathEntry(context, dirname(status.commandPath))
  }
  return getCliInstallStatus(context)
}

async function installSymlink(
  context: CliInstallContext,
  commandPath: string,
  launcherPath: string,
  state: CliInstallStatus['state']
): Promise<void> {
  try {
    if (state === 'installed') {
      return
    }
    if (state === 'stale') {
      await unlink(commandPath)
    }
    await mkdir(dirname(commandPath), { recursive: true })
    await symlink(launcherPath, commandPath)
  } catch (error) {
    if (context.platform !== 'darwin' || !isPermissionError(error)) {
      throw error
    }
    await context.privilegedRunner(
      `mkdir -p ${quoteShell(dirname(commandPath))} && ` +
        `ln -sfn ${quoteShell(launcherPath)} ${quoteShell(commandPath)}`
    )
  }
}

async function removeSymlink(context: CliInstallContext, commandPath: string): Promise<void> {
  try {
    await unlink(commandPath)
  } catch (error) {
    if (context.platform !== 'darwin' || !isPermissionError(error)) {
      throw error
    }
    await context.privilegedRunner(
      `if [ -L ${quoteShell(commandPath)} ]; then rm ${quoteShell(commandPath)}; fi`
    )
  }
}

async function ensureWindowsPathEntry(
  context: CliInstallContext,
  pathDirectory: string
): Promise<void> {
  const entries = splitPathEntries('win32', await context.userPathReader())
  if (entries.some((entry) => samePathEntry('win32', entry, pathDirectory))) {
    return
  }
  await writeWindowsUserPathEntry(
    context,
    [...entries, pathDirectory].join(';'),
    pathDirectory,
    'add'
  )
}

async function removeWindowsPathEntry(
  context: CliInstallContext,
  pathDirectory: string
): Promise<void> {
  if (context.platform !== 'win32') {
    return
  }
  const entries = splitPathEntries('win32', await context.userPathReader())
  const nextEntries = entries.filter((entry) => !samePathEntry('win32', entry, pathDirectory))
  if (nextEntries.length !== entries.length) {
    await writeWindowsUserPathEntry(context, nextEntries.join(';'), pathDirectory, 'remove')
  }
}

async function writeWindowsUserPathEntry(
  context: CliInstallContext,
  value: string,
  pathDirectory: string,
  action: 'add' | 'remove'
): Promise<void> {
  try {
    await context.userPathWriter(value)
  } catch (error) {
    if (!isWindowsUserPathPermissionError(error)) {
      throw error
    }
    const guidance =
      action === 'add'
        ? `Add this folder to your PATH manually: ${pathDirectory}. Or run Yiru as an administrator and try again.`
        : `Remove this folder from your PATH manually: ${pathDirectory}. Or run Yiru as an administrator and try again.`
    throw new Error(
      `Windows blocked updating your user PATH (access denied). This usually means your PATH environment variable is managed by Group Policy or your organization's device management. ${guidance}`,
      { cause: error }
    )
  }
}
