/* eslint-disable max-lines -- Why: cli-installer covers darwin/linux/win32 install, remove, fallback, and privileged-runner paths; each platform combination requires its own fixture and assertions to catch regressions. */
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir()
  }
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

import { CliInstaller } from './cli-installer'
import { buildAppImageCliWrapper } from './appimage-cli-wrapper'

async function makeFixture(): Promise<{
  root: string
  userDataPath: string
  appPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'yiru-cli-installer-'))
  const userDataPath = join(root, 'userData')
  const appPath = join(root, 'app')
  const cliEntryPath = join(appPath, 'out', 'cli', 'index.js')
  await mkdir(join(appPath, 'out', 'cli'), { recursive: true })
  await writeFile(cliEntryPath, 'console.log("yiru")\n', 'utf8')
  return { root, userDataPath, appPath }
}

async function createPackagedMacLauncher(root: string): Promise<string> {
  const resourcesPath = join(root, 'resources')
  await mkdir(join(resourcesPath, 'bin'), { recursive: true })
  await writeFile(join(resourcesPath, 'bin', 'yiru'), '#!/usr/bin/env bash\necho yiru\n', {
    encoding: 'utf8',
    mode: 0o755
  })
  return resourcesPath
}

describe('CliInstaller', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Why: this test creates Unix symlinks and shell scripts that only apply on macOS.
  it.skipIf(process.platform === 'win32')(
    'creates a dev launcher and installs a macOS symlink in the requested path',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'bin', 'yiru')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        processPathEnv: join(fixture.root, 'bin')
      })

      const initial = await installer.getStatus()
      expect(initial.state).toBe('not_installed')
      expect(initial.launcherPath).toContain(join('userData', 'cli', 'bin', 'yiru'))

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.pathConfigured).toBe(true)

      const launcherContent = await readFile(installed.launcherPath as string, 'utf8')
      expect(launcherContent).toContain('ELECTRON_RUN_AS_NODE=1')
      expect(launcherContent).toContain(`export YIRU_USER_DATA_PATH='${fixture.userDataPath}'`)
      expect(launcherContent).toContain('export YIRU_APP_EXECUTABLE="$ELECTRON"')
      expect(launcherContent).toContain(join(fixture.appPath, 'out', 'cli', 'index.js'))

      const removed = await installer.remove()
      expect(removed.state).toBe('not_installed')
    }
  )

  // Why: this test creates Unix symlinks and shell scripts that only apply on Linux.
  it.skipIf(process.platform === 'win32')(
    'creates a linux symlink under the requested path and warns when PATH is missing',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, '.local', 'bin', 'yiru')
      const installer = new CliInstaller({
        platform: 'linux',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/opt/Yiru/yiru',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        processPathEnv: '/usr/bin'
      })

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.commandName).toBe('yiru')
      expect(installed.pathConfigured).toBe(false)
      expect(installed.detail).toContain('.local')

      const launcherContent = await readFile(installed.launcherPath as string, 'utf8')
      expect(launcherContent).toContain('ELECTRON_RUN_AS_NODE=1')
      expect(launcherContent).toContain(`export YIRU_USER_DATA_PATH='${fixture.userDataPath}'`)

      const removed = await installer.remove()
      expect(removed.state).toBe('not_installed')
    }
  )

  // Why: dev installs are useful for validation, but they must not replace the
  // packaged `yiru` / `yiru` commands developers rely on day to day.
  it.skipIf(process.platform === 'win32')(
    'uses a separate yiru-dev command for default development installs',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const commandDir = join(homePath, '.local', 'bin')
      const installer = new CliInstaller({
        platform: 'linux',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/opt/Yiru/yiru',
        appPath: fixture.appPath,
        homePath,
        processPathEnv: commandDir
      })

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.commandName).toBe('yiru-dev')
      expect(installed.commandPath).toBe(join(commandDir, 'yiru-dev'))
      expect(installed.launcherPath).toBe(join(fixture.userDataPath, 'cli', 'bin', 'yiru-dev'))
      await expect(readlink(installed.commandPath as string)).resolves.toBe(installed.launcherPath)
      await expect(
        readFile(join(fixture.userDataPath, 'cli', 'bin', 'yiru'), 'utf8')
      ).resolves.toBe(await readFile(installed.launcherPath as string, 'utf8'))
    }
  )

  // Why: AppImage resources live under a per-launch FUSE mount, so the
  // installed shell command must be a stable wrapper rather than a symlink.
  it.skipIf(process.platform === 'win32')(
    'creates an AppImage wrapper under the linux command path',
    async () => {
      const fixture = await makeFixture()
      const commandDir = join(fixture.root, '.local', 'bin')
      const installPath = join(commandDir, 'yiru')
      const appImagePath = join(fixture.root, 'Yiru.AppImage')
      await writeFile(appImagePath, '#!/usr/bin/env bash\n', {
        encoding: 'utf8',
        mode: 0o755
      })

      const installer = new CliInstaller({
        platform: 'linux',
        isPackaged: true,
        appImagePath,
        commandPathOverride: installPath,
        processPathEnv: commandDir
      })

      const initial = await installer.getStatus()
      expect(initial).toMatchObject({
        state: 'not_installed',
        installMethod: 'wrapper',
        launcherPath: appImagePath
      })

      const installed = await installer.install()
      expect(installed).toMatchObject({
        state: 'installed',
        commandName: 'yiru',
        installMethod: 'wrapper',
        launcherPath: appImagePath,
        currentTarget: appImagePath,
        pathConfigured: true
      })

      const commandStats = await lstat(installPath)
      expect(commandStats.isFile()).toBe(true)
      expect(commandStats.mode & 0o111).not.toBe(0)
      await expect(readlink(installPath)).rejects.toMatchObject({ code: 'EINVAL' })
      await expect(readFile(installPath, 'utf8')).resolves.toBe(
        buildAppImageCliWrapper(appImagePath)
      )

      const removed = await installer.remove()
      expect(removed.state).toBe('not_installed')
    }
  )

  it.skipIf(process.platform === 'win32')(
    'reports a stale AppImage wrapper when the AppImage path changes',
    async () => {
      const fixture = await makeFixture()
      const commandDir = join(fixture.root, '.local', 'bin')
      const installPath = join(commandDir, 'yiru')
      const oldAppImagePath = join(fixture.root, 'Old-Yiru.AppImage')
      const newAppImagePath = join(fixture.root, 'Yiru.AppImage')
      await mkdir(commandDir, { recursive: true })
      await writeFile(installPath, buildAppImageCliWrapper(oldAppImagePath), {
        encoding: 'utf8',
        mode: 0o755
      })
      await writeFile(newAppImagePath, '#!/usr/bin/env bash\n', {
        encoding: 'utf8',
        mode: 0o755
      })

      const installer = new CliInstaller({
        platform: 'linux',
        isPackaged: true,
        appImagePath: newAppImagePath,
        commandPathOverride: installPath,
        processPathEnv: commandDir
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'stale',
        installMethod: 'wrapper',
        currentTarget: newAppImagePath
      })

      await expect(installer.install()).resolves.toMatchObject({ state: 'installed' })
      await expect(readFile(installPath, 'utf8')).resolves.toBe(
        buildAppImageCliWrapper(newAppImagePath)
      )
    }
  )

  it('creates a windows wrapper and updates the user PATH', async () => {
    const fixture = await makeFixture()
    const installPath = join(fixture.root, 'Programs', 'Yiru', 'bin', 'yiru.cmd')
    let userPath = 'C:\\Windows\\System32'
    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: false,
      userDataPath: fixture.userDataPath,
      execPath: 'C:\\Users\\me\\AppData\\Local\\Yiru\\Yiru.exe',
      appPath: fixture.appPath,
      commandPathOverride: installPath,
      userPathReader: async () => userPath,
      userPathWriter: async (value) => {
        userPath = value
      }
    })

    const installed = await installer.install()
    expect(installed.state).toBe('installed')
    expect(installed.pathConfigured).toBe(true)
    expect(userPath).toContain(join(fixture.root, 'Programs', 'Yiru', 'bin'))

    const wrapperContent = await readFile(installPath, 'utf8')
    expect(wrapperContent).toContain('YIRU_LAUNCHER=')
    expect(wrapperContent).toContain('yiru.cmd')
    const launcherContent = await readFile(installed.launcherPath as string, 'utf8')
    expect(launcherContent).toContain(`set "YIRU_USER_DATA_PATH=${fixture.userDataPath}"`)
    expect(launcherContent).toContain('set "YIRU_APP_EXECUTABLE=%ELECTRON%"')

    const removed = await installer.remove()
    expect(removed.state).toBe('not_installed')
    expect(userPath).not.toContain(join(fixture.root, 'Programs', 'Yiru', 'bin'))
  })

  it.each(['UnauthorizedAccessException', 'SecurityException'])(
    'rejects with a friendly message for Windows PATH denial: %s',
    async (permissionMarker) => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'Programs', 'Yiru', 'bin', 'yiru.cmd')
      const installer = new CliInstaller({
        platform: 'win32',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: 'C:\\Users\\me\\AppData\\Local\\Yiru\\Yiru.exe',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        userPathReader: async () => 'C:\\Windows\\System32',
        userPathWriter: async () => {
          // The .NET error id survives localized or mojibake PowerShell output.
          const error = new Error(
            `Command failed: powershell -NoProfile -Command [Environment]::SetEnvironmentVariable('Path', '...', 'User')\nFullyQualifiedErrorId : ${permissionMarker},Microsoft.PowerShell.Commands`
          )
          Object.assign(error, { code: 1 })
          throw error
        }
      })

      const result = installer.install()
      await expect(result).rejects.toThrow(/access denied|Group Policy|manually/i)
      await expect(result).rejects.not.toThrow(/Command failed: powershell/)
      await expect(result).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringContaining(permissionMarker)
        })
      })
    }
  )

  it('skips the Windows PATH write when removing an absent entry', async () => {
    const fixture = await makeFixture()
    const userPathWriter = vi.fn()
    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: false,
      userDataPath: fixture.userDataPath,
      execPath: 'C:\\Users\\me\\AppData\\Local\\Yiru\\Yiru.exe',
      appPath: fixture.appPath,
      commandPathOverride: join(fixture.root, 'Programs', 'Yiru', 'bin', 'yiru.cmd'),
      userPathReader: async () => 'C:\\Windows\\System32',
      userPathWriter
    })

    await expect(installer.remove()).resolves.toMatchObject({ state: 'not_installed' })
    expect(userPathWriter).not.toHaveBeenCalled()
  })

  it.each([
    ['PowerShell timeout', 'Windows PATH command timed out after 5000ms.'],
    [
      'generic PowerShell method failure',
      "Command failed: powershell -NoProfile -Command [Environment]::SetEnvironmentVariable('Path', '...', 'User')\nCategoryInfo : NotSpecified: (:) [], MethodInvocationException\nFullyQualifiedErrorId : MethodInvocationException"
    ]
  ])(
    'propagates a non-permission Windows PATH write error unchanged: %s',
    async (_name, message) => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'Programs', 'Yiru', 'bin', 'yiru.cmd')
      const installer = new CliInstaller({
        platform: 'win32',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: 'C:\\Users\\me\\AppData\\Local\\Yiru\\Yiru.exe',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        userPathReader: async () => 'C:\\Windows\\System32',
        userPathWriter: async () => {
          throw new Error(message)
        }
      })

      const result = installer.install()
      await expect(result).rejects.toThrow(message)
      await expect(result).rejects.not.toThrow(/Windows blocked updating your user PATH/)
    }
  )

  it('settles when the Windows PATH query hangs', async () => {
    vi.useFakeTimers()
    const fixture = await makeFixture()
    const installPath = join(fixture.root, 'Programs', 'Yiru', 'bin', 'yiru.cmd')
    const killMock = vi.fn()
    execFileMock.mockImplementation(() => ({ kill: killMock }))
    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: false,
      userDataPath: fixture.userDataPath,
      execPath: 'C:\\Users\\me\\AppData\\Local\\Yiru\\Yiru.exe',
      appPath: fixture.appPath,
      commandPathOverride: installPath
    })

    const promise = installer.getStatus()
    let settled = false
    void promise
      .catch(() => undefined)
      .finally(() => {
        settled = true
      })

    await vi.waitFor(() => expect(execFileMock).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(5_000)
    await Promise.resolve()

    expect(settled).toBe(true)
    await expect(promise).rejects.toThrow('Windows PATH command timed out')
    expect(killMock).toHaveBeenCalled()
  })

  // Why: this test creates a Unix symlink to /tmp/not-yiru, which only applies on macOS/Linux.
  it.skipIf(process.platform === 'win32')(
    'refuses to replace an unknown symlink at the command path',
    async () => {
      const fixture = await makeFixture()
      const installPath = join(fixture.root, 'bin', 'yiru')
      const existingTarget = '/tmp/not-yiru'
      await mkdir(join(fixture.root, 'bin'), { recursive: true })
      await symlink(existingTarget, installPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        commandPathOverride: installPath
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'conflict',
        supported: true
      })
      await expect(installer.install()).rejects.toThrow('Refusing to replace non-Yiru command')
      await expect(readlink(installPath)).resolves.toBe(existingTarget)
    }
  )

  // Why: packaged app moves can leave a symlink to an older Yiru-owned launcher;
  // those are safe to refresh, unlike arbitrary user symlinks.
  it.skipIf(process.platform === 'win32')(
    'replaces stale packaged Yiru launcher symlinks',
    async () => {
      const fixture = await makeFixture()
      const commandDir = join(fixture.root, 'bin')
      const installPath = join(commandDir, 'yiru')
      const resourcesPath = join(fixture.root, 'Current.app', 'Contents', 'Resources')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      const oldLauncherPath = join(fixture.root, 'Old.app', 'Contents', 'Resources', 'bin', 'yiru')
      await mkdir(commandDir, { recursive: true })
      await mkdir(join(resourcesPath, 'bin'), { recursive: true })
      await writeFile(launcherPath, '#!/usr/bin/env bash\n', 'utf8')
      await symlink(oldLauncherPath, installPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        commandPathOverride: installPath,
        processPathEnv: commandDir
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'stale',
        currentTarget: oldLauncherPath
      })
      await expect(installer.install()).resolves.toMatchObject({ state: 'installed' })
      await expect(readlink(installPath)).resolves.toBe(launcherPath)
    }
  )

  // Why: old dev/package experiments wrote a generated Yiru launcher file
  // directly into /usr/local/bin/yiru. That broke profiling because Settings
  // treated the regular file as a hard conflict and would not self-heal it.
  it.skipIf(process.platform === 'win32')(
    'replaces stale generated Unix launcher files',
    async () => {
      const fixture = await makeFixture()
      const commandDir = join(fixture.root, 'bin')
      const installPath = join(commandDir, 'yiru')
      const resourcesPath = join(fixture.root, 'Current.app', 'Contents', 'Resources')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      const oldCliPath = join(fixture.root, 'OldWorktree', 'out', 'cli', 'index.js')
      await mkdir(commandDir, { recursive: true })
      await mkdir(join(resourcesPath, 'bin'), { recursive: true })
      await writeFile(launcherPath, '#!/usr/bin/env bash\n', 'utf8')
      await writeFile(
        installPath,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          "ELECTRON='/tmp/Old.app/Contents/MacOS/Electron'",
          `CLI='${oldCliPath}'`,
          'export YIRU_NODE_OPTIONS="${NODE_OPTIONS-}"',
          'export YIRU_NODE_REPL_EXTERNAL_MODULE="${NODE_REPL_EXTERNAL_MODULE-}"',
          'unset NODE_OPTIONS',
          'unset NODE_REPL_EXTERNAL_MODULE',
          'ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"',
          ''
        ].join('\n'),
        'utf8'
      )

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        commandPathOverride: installPath,
        processPathEnv: commandDir
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'stale',
        currentTarget: oldCliPath
      })
      await expect(installer.install()).resolves.toMatchObject({ state: 'installed' })
      await expect(readlink(installPath)).resolves.toBe(launcherPath)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'keeps arbitrary regular files at the command path as conflicts',
    async () => {
      const fixture = await makeFixture()
      const commandDir = join(fixture.root, 'bin')
      const installPath = join(commandDir, 'yiru')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      await mkdir(commandDir, { recursive: true })
      await writeFile(
        installPath,
        '#!/usr/bin/env bash\nELECTRON_RUN_AS_NODE=1 /tmp/not-yiru "$@"\n',
        'utf8'
      )

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        commandPathOverride: installPath,
        processPathEnv: commandDir
      })

      await expect(installer.getStatus()).resolves.toMatchObject({
        state: 'conflict',
        currentTarget: null
      })
      await expect(installer.install()).rejects.toThrow('Refusing to replace non-Yiru command')
      await expect(readFile(installPath, 'utf8')).resolves.toContain('/tmp/not-yiru')
    }
  )

  // Why: a dev build can temporarily own the public command on developer
  // machines; packaged Yiru should treat that as stale, not a hard conflict.
  it.skipIf(process.platform === 'win32')(
    'replaces stale sibling dev launcher symlinks from packaged installs',
    async () => {
      const fixture = await makeFixture()
      for (const devLauncherName of ['yiru', 'yiru-dev']) {
        const caseRoot = join(fixture.root, devLauncherName)
        const commandDir = join(caseRoot, 'bin')
        const installPath = join(commandDir, 'yiru')
        const userDataPath = join(caseRoot, 'yiru')
        const resourcesPath = join(caseRoot, 'Current.app', 'Contents', 'Resources')
        const launcherPath = join(resourcesPath, 'bin', 'yiru')
        const devLauncherPath = join(`${userDataPath}-dev`, 'cli', 'bin', devLauncherName)
        await mkdir(commandDir, { recursive: true })
        await mkdir(join(resourcesPath, 'bin'), { recursive: true })
        await mkdir(join(`${userDataPath}-dev`, 'cli', 'bin'), { recursive: true })
        await writeFile(launcherPath, '#!/usr/bin/env bash\n', 'utf8')
        await writeFile(devLauncherPath, '#!/usr/bin/env bash\n', 'utf8')
        await symlink(devLauncherPath, installPath)

        const installer = new CliInstaller({
          platform: 'darwin',
          isPackaged: true,
          userDataPath,
          resourcesPath,
          commandPathOverride: installPath,
          processPathEnv: commandDir
        })

        await expect(installer.getStatus()).resolves.toMatchObject({
          state: 'stale',
          currentTarget: devLauncherPath
        })
        await expect(installer.install()).resolves.toMatchObject({ state: 'installed' })
        await expect(readlink(installPath)).resolves.toBe(launcherPath)
      }
    }
  )

  // Why: on Apple Silicon, /usr/local/bin does not exist by default. The installer
  // must fall back to ~/.local/bin (user-writable, no sudo) rather than failing
  // silently when the parent directory is absent.
  it.skipIf(process.platform === 'win32')(
    'falls back to ~/.local/bin/yiru on macOS when /usr/local/bin does not exist',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      // Simulate arm64: point defaultMacCommandPath at a dir that does not exist
      // in the fixture so existsSync(dirname(...)) returns false.
      const absentUsrLocalBin = join(fixture.root, 'usr', 'local', 'bin', 'yiru')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: absentUsrLocalBin,
        processPathEnv: join(homePath, '.local', 'bin')
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(join(homePath, '.local', 'bin', 'yiru'))
      expect(status.state).toBe('not_installed')
      expect(status.supported).toBe(true)

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.commandPath).toBe(join(homePath, '.local', 'bin', 'yiru'))
      expect(installed.pathConfigured).toBe(true)
    }
  )

  // Why: on Intel Macs /usr/local/bin exists, so the installer must keep using
  // it as the canonical path and not regress to ~/.local/bin.
  it.skipIf(process.platform === 'win32')(
    'uses /usr/local/bin/yiru on macOS when /usr/local/bin exists',
    async () => {
      const fixture = await makeFixture()
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      await mkdir(usrLocalBin, { recursive: true })

      const installPath = join(usrLocalBin, 'yiru')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        defaultMacCommandPath: installPath,
        processPathEnv: usrLocalBin
      })

      const installed = await installer.install()
      expect(installed.state).toBe('installed')
      expect(installed.commandPath).toBe(installPath)
      expect(installed.pathConfigured).toBe(true)
    }
  )

  // Why: users can have a managed Yiru command in ~/.local/bin even when
  // /usr/local/bin exists; Settings must follow the shell-visible command.
  it.skipIf(process.platform === 'win32')(
    'uses an existing managed macOS yiru command from the shell PATH before /usr/local/bin',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await symlink(launcherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${userLocalBin}:${usrLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.state).toBe('installed')
      expect(status.commandPath).toBe(userInstallPath)
      expect(status.pathConfigured).toBe(true)

      const installed = await installer.install()
      expect(installed.commandPath).toBe(userInstallPath)
      await expect(readlink(userInstallPath)).resolves.toBe(launcherPath)
      await expect(lstat(defaultInstallPath)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  // Why: POSIX command lookup skips broken symlinks and keeps searching PATH,
  // so a stale earlier artifact must not steal status from the install path.
  it.skipIf(process.platform === 'win32')(
    'skips a broken managed macOS yiru symlink before /usr/local/bin',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      const oldLauncherPath = join(fixture.root, 'Old.app', 'Contents', 'Resources', 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await symlink(oldLauncherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${userLocalBin}:${usrLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status).toMatchObject({
        commandPath: defaultInstallPath,
        state: 'not_installed',
        currentTarget: null
      })

      const installed = await installer.install()
      expect(installed.commandPath).toBe(defaultInstallPath)
      expect(installed.state).toBe('installed')
      await expect(readlink(defaultInstallPath)).resolves.toBe(launcherPath)
      await expect(readlink(userInstallPath)).resolves.toBe(oldLauncherPath)
    }
  )

  // Why: PATH lookup stops at the first existing command; a later managed
  // ~/.local/bin/yiru must not steal status from /usr/local/bin/yiru.
  it.skipIf(process.platform === 'win32')(
    'keeps the default macOS command when a managed yiru appears later on PATH',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await symlink(launcherPath, defaultInstallPath)
      await symlink(launcherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${usrLocalBin}:${userLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(defaultInstallPath)
      expect(status.state).toBe('installed')
    }
  )

  // Why: shells skip missing PATH entries, so a managed command later in PATH
  // is still the shell-visible Yiru command until the default path is installed.
  it.skipIf(process.platform === 'win32')(
    'uses a later managed macOS yiru command when the default command is missing',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await symlink(launcherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${usrLocalBin}:${userLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(userInstallPath)
      expect(status.state).toBe('installed')

      const installed = await installer.install()
      expect(installed.commandPath).toBe(userInstallPath)
      await expect(lstat(defaultInstallPath)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  // Why: bash/zsh skip non-executable PATH entries even at Yiru's configured
  // install slot, then keep looking for a runnable command later in PATH.
  it.skipIf(process.platform === 'win32')(
    'uses a later managed macOS yiru command when the default command is not executable',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await writeFile(defaultInstallPath, '#!/usr/bin/env bash\necho other-yiru\n', 'utf8')
      await symlink(launcherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${usrLocalBin}:${userLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(userInstallPath)
      expect(status.state).toBe('installed')

      const installed = await installer.install()
      expect(installed.commandPath).toBe(userInstallPath)
      await expect(readFile(defaultInstallPath, 'utf8')).resolves.toContain('other-yiru')
    }
  )

  // Why: a non-Yiru command after an empty default install slot can be shadowed
  // by installing the default path without replacing the user's command.
  it.skipIf(process.platform === 'win32')(
    'installs the default macOS command instead of replacing an unmanaged later command',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await writeFile(userInstallPath, '#!/usr/bin/env bash\necho other-yiru\n', {
        encoding: 'utf8',
        mode: 0o755
      })

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${usrLocalBin}:${userLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(defaultInstallPath)
      expect(status.state).toBe('not_installed')

      const installed = await installer.install()
      expect(installed.commandPath).toBe(defaultInstallPath)
      expect(installed.state).toBe('installed')
      await expect(readlink(defaultInstallPath)).resolves.toBe(launcherPath)
      await expect(readFile(userInstallPath, 'utf8')).resolves.toContain('other-yiru')
    }
  )

  // Why: an off-PATH ~/.local/bin/yiru must not hijack CLI registration and
  // leave the shell-visible /usr/local/bin command missing.
  it.skipIf(process.platform === 'win32')(
    'ignores managed macOS yiru commands that are not visible on the shell PATH',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await symlink(launcherPath, userInstallPath)

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: usrLocalBin
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(defaultInstallPath)
      expect(status.pathConfigured).toBe(true)
      expect(status.state).toBe('not_installed')

      const installed = await installer.install()
      expect(installed.commandPath).toBe(defaultInstallPath)
      expect(installed.state).toBe('installed')
      await expect(readlink(defaultInstallPath)).resolves.toBe(launcherPath)
      await expect(readlink(userInstallPath)).resolves.toBe(launcherPath)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'reports a conflict for an unmanaged macOS yiru that shadows the install path',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await writeFile(userInstallPath, '#!/usr/bin/env bash\necho other-yiru\n', {
        encoding: 'utf8',
        mode: 0o755
      })

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${userLocalBin}:${usrLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(userInstallPath)
      expect(status.state).toBe('conflict')
      await expect(installer.install()).rejects.toThrow('Refusing to replace non-Yiru command')
      await expect(lstat(defaultInstallPath)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(userInstallPath, 'utf8')).resolves.toContain('other-yiru')
    }
  )

  // Why: bash/zsh skip non-executable PATH entries, so reporting them as a
  // conflict would block a valid later install path the shell would use.
  it.skipIf(process.platform === 'win32')(
    'skips a non-executable unmanaged macOS yiru before the install path',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
      const userLocalBin = join(homePath, '.local', 'bin')
      const defaultInstallPath = join(usrLocalBin, 'yiru')
      const userInstallPath = join(userLocalBin, 'yiru')
      const launcherPath = join(resourcesPath, 'bin', 'yiru')
      await mkdir(usrLocalBin, { recursive: true })
      await mkdir(userLocalBin, { recursive: true })
      await writeFile(userInstallPath, '#!/usr/bin/env bash\necho other-yiru\n', 'utf8')

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: defaultInstallPath,
        processPathEnv: `${userLocalBin}:${usrLocalBin}`
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(defaultInstallPath)
      expect(status.state).toBe('not_installed')

      const installed = await installer.install()
      expect(installed.commandPath).toBe(defaultInstallPath)
      expect(installed.state).toBe('installed')
      await expect(readlink(defaultInstallPath)).resolves.toBe(launcherPath)
      await expect(readFile(userInstallPath, 'utf8')).resolves.toContain('other-yiru')
    }
  )

  // Why: when macCommandPath falls back to ~/.local/bin/yiru on arm64, commandName
  // must still be 'yiru' (not 'yiru' which is Linux-only).
  it.skipIf(process.platform === 'win32')(
    'reports commandName as yiru (not yiru) when falling back to ~/.local/bin on macOS',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const absentUsrLocalBin = join(fixture.root, 'usr', 'local', 'bin', 'yiru')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: absentUsrLocalBin,
        processPathEnv: join(homePath, '.local', 'bin')
      })

      const status = await installer.getStatus()
      expect(status.commandName).toBe('yiru')
    }
  )

  // Why: the privilegedRunner is injectable so the EACCES→osascript path can be
  // exercised in integration without spawning osascript in unit tests.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'invokes the injected privilegedRunner when install falls back to elevated permissions',
    async () => {
      const fixture = await makeFixture()
      const protectedDir = join(fixture.root, 'protected')
      await mkdir(protectedDir)
      await chmod(protectedDir, 0o500)

      const installPath = join(protectedDir, 'bin', 'yiru')
      const privilegedCommands: string[] = []
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: false,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        commandPathOverride: installPath,
        privilegedRunner: async (command: string) => {
          privilegedCommands.push(command)
          await chmod(protectedDir, 0o700)
          const launcherPath = (await installer.getStatus()).launcherPath as string
          await mkdir(dirname(installPath), { recursive: true })
          await symlink(launcherPath, installPath)
        },
        processPathEnv: dirname(installPath)
      })

      try {
        const installed = await installer.install()

        expect(installed.state).toBe('installed')
        expect(installed.pathConfigured).toBe(true)
        expect(privilegedCommands).toHaveLength(1)
        expect(privilegedCommands[0]).toContain('mkdir -p')
        expect(privilegedCommands[0]).toContain('ln -sfn')
        await expect(readlink(installPath)).resolves.toBe(installed.launcherPath)
      } finally {
        await chmod(protectedDir, 0o700).catch(() => undefined)
      }
    }
  )

  // Why: macCommandPath is resolved at construction — getStatus() must return the
  // same commandPath on repeated calls without re-running existsSync.
  it.skipIf(process.platform === 'win32')(
    'resolves macCommandPath once at construction — commandPath stable across repeated getStatus()',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const resourcesPath = await createPackagedMacLauncher(fixture.root)
      const absentUsrLocalBin = join(fixture.root, 'usr', 'local', 'bin', 'yiru')
      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: absentUsrLocalBin,
        processPathEnv: join(homePath, '.local', 'bin')
      })

      const s1 = await installer.getStatus()
      await mkdir(dirname(absentUsrLocalBin), { recursive: true })
      const s2 = await installer.getStatus()
      const s3 = await installer.getStatus()

      expect(s1.commandPath).toBe(s2.commandPath)
      expect(s2.commandPath).toBe(s3.commandPath)
      expect(s1.commandPath).toBe(join(homePath, '.local', 'bin', 'yiru'))
    }
  )

  it('resolves custom-install packaged Windows command path from resourcesPath', async () => {
    const fixture = await makeFixture()
    const localAppDataPath = join(fixture.root, 'AppData', 'Local')
    const resourcesPath = join(fixture.root, 'D Custom Yiru', 'resources')
    await mkdir(join(resourcesPath, 'bin'), { recursive: true })
    await writeFile(join(resourcesPath, 'bin', 'yiru.exe'), 'native launcher', 'utf8')

    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: true,
      resourcesPath,
      localAppDataPath,
      userDataPath: fixture.userDataPath,
      execPath: join(fixture.root, 'D Custom Yiru', 'Yiru.exe'),
      appPath: fixture.appPath,
      userPathReader: async () => null,
      userPathWriter: async () => {}
    })

    const status = await installer.getStatus()
    expect(status.commandPath).toBe(join(resourcesPath, 'bin', 'yiru.exe'))
  })

  it('does not overwrite the packaged Windows launcher while registering PATH', async () => {
    const fixture = await makeFixture()
    const localAppDataPath = join(fixture.root, 'AppData', 'Local')
    const resourcesPath = join(fixture.root, 'D Custom Yiru', 'resources')
    const bundledLauncher = join(resourcesPath, 'bin', 'yiru.exe')
    const bundledContent = 'native launcher'
    await mkdir(dirname(bundledLauncher), { recursive: true })
    await writeFile(bundledLauncher, bundledContent, 'utf8')

    let userPath: string | null = null
    const installer = new CliInstaller({
      platform: 'win32',
      isPackaged: true,
      resourcesPath,
      localAppDataPath,
      userDataPath: fixture.userDataPath,
      execPath: join(fixture.root, 'D Custom Yiru', 'Yiru.exe'),
      appPath: fixture.appPath,
      userPathReader: async () => userPath,
      userPathWriter: async (value) => {
        userPath = value
      }
    })

    const installed = await installer.install()

    expect(installed.state).toBe('installed')
    expect(installed.pathConfigured).toBe(true)
    expect(installed.commandPath).toBe(bundledLauncher)
    expect(userPath).toBe(dirname(bundledLauncher))
    await expect(readFile(bundledLauncher, 'utf8')).resolves.toBe(bundledContent)

    const removed = await installer.remove()

    expect(removed.state).toBe('not_installed')
    expect(removed.pathConfigured).toBe(false)
    expect(userPath).toBe('')
    await expect(readFile(bundledLauncher, 'utf8')).resolves.toBe(bundledContent)
  })

  // Why: the arm64 fallback must apply for packaged builds, not just dev launchers.
  it.skipIf(process.platform === 'win32')(
    'resolves to ~/.local/bin/yiru on arm64 even when isPackaged is true',
    async () => {
      const fixture = await makeFixture()
      const homePath = join(fixture.root, 'home')
      const absentUsrLocalBin = join(fixture.root, 'usr', 'local', 'bin', 'yiru')
      const resourcesPath = join(fixture.root, 'resources')
      const bundledLauncher = join(resourcesPath, 'bin', 'yiru')
      await mkdir(join(resourcesPath, 'bin'), { recursive: true })
      await writeFile(bundledLauncher, '#!/usr/bin/env bash\necho yiru\n', {
        encoding: 'utf8',
        mode: 0o755
      })

      const installer = new CliInstaller({
        platform: 'darwin',
        isPackaged: true,
        resourcesPath,
        userDataPath: fixture.userDataPath,
        execPath: '/Applications/Yiru.app/Contents/MacOS/Yiru',
        appPath: fixture.appPath,
        homePath,
        defaultMacCommandPath: absentUsrLocalBin,
        processPathEnv: join(homePath, '.local', 'bin')
      })

      const status = await installer.getStatus()
      expect(status.commandPath).toBe(join(homePath, '.local', 'bin', 'yiru'))
      expect(status.supported).toBe(true)
    }
  )
})
