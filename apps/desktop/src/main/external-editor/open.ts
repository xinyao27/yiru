import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'

import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult
} from '~shared/shell-open-types'

import {
  EXTERNAL_EDITOR_CLI_COMMAND,
  resolveExternalEditorLaunchSpec,
  type ExternalEditorLaunchSpec
} from '../external-editor-launch'
import { getSpawnArgsForWindows } from '../windows-host'

export { EXTERNAL_EDITOR_CLI_COMMAND }

export async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue)
    return true
  } catch {
    return false
  }
}

export async function validateLocalPathTarget(
  pathValue: string
): Promise<{ ok: true; path: string } | { ok: false; reason: 'not-absolute' | 'not-found' }> {
  const normalizedPath = normalize(pathValue)
  if (!isAbsolute(normalizedPath)) {
    return { ok: false, reason: 'not-absolute' }
  }
  if (!(await pathExists(normalizedPath))) {
    return { ok: false, reason: 'not-found' }
  }
  return { ok: true, path: normalizedPath }
}

export async function openInExternalEditor(
  request: ShellOpenExternalEditorRequest
): Promise<ShellOpenExternalEditorResult> {
  // Why: a connectionId only ever named an SSH host, and its VS Code Remote-SSH
  // authority is gone. Refuse rather than resolving the remote path locally.
  if (request.connectionId?.trim()) {
    return { ok: false, reason: 'remote-runtime-unsupported' }
  }

  const target = await validateLocalPathTarget(request.path)
  if (!target.ok) {
    return target
  }
  try {
    await launchExternalEditor(resolveExternalEditorLaunchSpec(request.command, target.path))
    return { ok: true }
  } catch {
    return { ok: false, reason: 'launch-failed' }
  }
}

async function launchExternalEditor(launchSpec: ExternalEditorLaunchSpec): Promise<void> {
  const { spawnCmd, spawnArgs } =
    launchSpec.kind === 'executable'
      ? getSpawnArgsForWindows(launchSpec.spawnCmd, launchSpec.spawnArgs)
      : { spawnCmd: launchSpec.spawnCmd, spawnArgs: launchSpec.spawnArgs }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(spawnCmd, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      // Why: terminal editors such as nvim need a visible console on Windows;
      // GUI editor launches stay hidden to avoid command-shim flashes.
      windowsHide: launchSpec.hideWindowsConsole
    })
    let settled = false

    function cleanup(): void {
      child.off('error', onError)
      child.off('spawn', onSpawn)
    }

    function settle(callback: () => void): void {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    function onError(error: Error): void {
      settle(() => rejectPromise(error))
    }

    function onSpawn(): void {
      child.unref()
      settle(resolvePromise)
    }
    child.once('error', onError)
    child.once('spawn', onSpawn)
  })
}
