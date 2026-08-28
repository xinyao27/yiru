import { readFile, stat } from 'node:fs/promises'
import { release } from 'node:os'
import { basename, dirname, extname, isAbsolute, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult,
  ShellRenderingHost
} from '@yiru/runtime-protocol/contract'
import { MAX_REPO_ICON_UPLOAD_BYTES } from '@yiru/runtime-protocol/model/workspace'

import { pickNativeDirectories, pickNativeDirectory, pickNativeFile } from './picker'

export type NativePlatformActions = {
  renderingHost: () => ShellRenderingHost
  openPath: (path: string) => Promise<void>
  openInFileManager: (path: string) => Promise<ShellOpenLocalPathResult>
  openInExternalEditor: (
    request: ShellOpenExternalEditorRequest
  ) => Promise<ShellOpenExternalEditorResult>
  openUrl: (url: string) => Promise<void>
  openFilePath: (path: string) => Promise<boolean>
  openFileUri: (uri: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
  pickAttachment: () => Promise<string | null>
  pickImage: () => Promise<string | null>
  pickRepoIconImage: () => Promise<{ dataUrl: string; fileName: string } | null>
  pickAudio: () => Promise<string | null>
  pickDirectory: (defaultPath?: string) => Promise<string | null>
  pickDirectories: (options?: { defaultPath?: string; multiple?: boolean }) => Promise<string[]>
}

export function createNativePlatformActions(): NativePlatformActions {
  return {
    renderingHost: () => ({
      platform: process.platform,
      osRelease: release(),
      displayServer:
        process.platform === 'linux'
          ? process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY
            ? 'wayland'
            : 'x11'
          : null
    }),
    openPath: async (path) => {
      await openInFileManager(path)
    },
    openInFileManager,
    openInExternalEditor,
    openUrl,
    openFilePath: openWithSystemDefault,
    openFileUri,
    pathExists,
    pickAttachment: () => pickNativeFile('attachment'),
    pickImage: () => pickNativeFile('image'),
    pickRepoIconImage,
    pickAudio: () => pickNativeFile('audio'),
    pickDirectory: pickNativeDirectory,
    pickDirectories: pickNativeDirectories
  }
}

async function openInFileManager(pathValue: string): Promise<ShellOpenLocalPathResult> {
  const target = await validateLocalPath(pathValue)
  if (!target.ok) {
    return target
  }
  const launched = await runDetached(
    process.platform === 'darwin'
      ? ['open', '-R', target.path]
      : process.platform === 'win32'
        ? ['explorer.exe', `/select,${target.path}`]
        : ['xdg-open', dirname(target.path)]
  )
  return launched ? { ok: true } : { ok: false, reason: 'launch-failed' }
}

async function openInExternalEditor(
  request: ShellOpenExternalEditorRequest
): Promise<ShellOpenExternalEditorResult> {
  if (request.connectionId?.trim()) {
    return { ok: false, reason: 'remote-runtime-unsupported' }
  }
  const target = await validateLocalPath(request.path)
  if (!target.ok) {
    return target
  }
  const launched = await runEditor(request.command?.trim() || 'code', target.path)
  return launched ? { ok: true } : { ok: false, reason: 'launch-failed' }
}

async function runEditor(command: string, targetPath: string): Promise<boolean> {
  if (/\s/.test(command)) {
    if (process.platform === 'win32') {
      const powershell = Bun.which('pwsh.exe') ?? Bun.which('powershell.exe')
      return powershell
        ? runDetached([
            powershell,
            '-NoProfile',
            '-Command',
            '& ([scriptblock]::Create($args[0])) $args[1]',
            command,
            targetPath
          ])
        : false
    }
    return runDetached(['/bin/sh', '-c', `${command} "$1"`, 'yiru-editor', targetPath])
  }
  const executable = isAbsolute(command) ? command : Bun.which(command)
  if (!executable) {
    return false
  }
  return runDetached([
    executable,
    ...(basename(command)
      .replace(/\.(?:cmd|exe|bat)$/i, '')
      .toLowerCase() === 'cursor'
      ? ['--new-window']
      : []),
    targetPath
  ])
}

async function openUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return
  }
  await openSystemTarget(parsed.toString())
}

async function openFileUri(rawUri: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUri)
  } catch {
    return
  }
  if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
    return
  }
  try {
    await openWithSystemDefault(fileURLToPath(parsed))
  } catch {}
}

async function openWithSystemDefault(pathValue: string): Promise<boolean> {
  const target = await validateLocalPath(pathValue)
  return target.ok ? openSystemTarget(target.path) : false
}

async function openSystemTarget(target: string): Promise<boolean> {
  return runDetached(
    process.platform === 'darwin'
      ? ['open', target]
      : process.platform === 'win32'
        ? ['explorer.exe', target]
        : ['xdg-open', target]
  )
}

async function runDetached(argumentsList: string[]): Promise<boolean> {
  try {
    const child = Bun.spawn(argumentsList, {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore'
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

async function validateLocalPath(
  pathValue: string
): Promise<{ ok: true; path: string } | { ok: false; reason: 'not-absolute' | 'not-found' }> {
  const path = normalize(pathValue)
  if (!isAbsolute(path)) {
    return { ok: false, reason: 'not-absolute' }
  }
  return (await pathExists(path)) ? { ok: true, path } : { ok: false, reason: 'not-found' }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function pickRepoIconImage(): Promise<{ dataUrl: string; fileName: string } | null> {
  const filePath = await pickNativeFile('image')
  if (!filePath) {
    return null
  }
  if (extname(filePath).toLowerCase() !== '.png') {
    throw new Error('repo_icon_png_required')
  }
  if ((await stat(filePath)).size > MAX_REPO_ICON_UPLOAD_BYTES) {
    throw new Error('repo_icon_too_large')
  }
  return {
    dataUrl: `data:image/png;base64,${Buffer.from(await readFile(filePath)).toString('base64')}`,
    fileName: basename(filePath)
  }
}
