import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { writeSecureFile } from '../runtime/secure-file'
import { resolveDaemonServiceCommand } from './command'

export type DaemonServiceState = 'not_installed' | 'running' | 'stopped'

const SERVICE_LABEL = 'com.yiru.daemon'
const SYSTEMD_UNIT = 'yiru.service'
const WINDOWS_TASK = 'Yiru Daemon'

export function installDaemonService(): void {
  if (process.platform === 'darwin') {
    installLaunchAgent()
    return
  }
  if (process.platform === 'linux') {
    installSystemdUnit()
    return
  }
  if (process.platform === 'win32') {
    installWindowsTask()
    return
  }
  throw new Error('daemon_service_platform_unsupported')
}

export function uninstallDaemonService(): void {
  if (process.platform === 'darwin') {
    const path = launchAgentPath()
    runAllowFailure(['launchctl', 'bootout', launchDomain(), path])
    rmSync(path, { force: true })
    return
  }
  if (process.platform === 'linux') {
    runAllowFailure(['systemctl', '--user', 'disable', '--now', SYSTEMD_UNIT])
    rmSync(systemdUnitPath(), { force: true })
    runRequired(['systemctl', '--user', 'daemon-reload'])
    return
  }
  if (process.platform === 'win32') {
    runAllowFailure(['schtasks.exe', '/Delete', '/F', '/TN', WINDOWS_TASK])
    return
  }
  throw new Error('daemon_service_platform_unsupported')
}

export function readDaemonServiceState(): DaemonServiceState {
  if (process.platform === 'darwin') {
    if (!existsSync(launchAgentPath())) {
      return 'not_installed'
    }
    return runAllowFailure(['launchctl', 'print', `${launchDomain()}/${SERVICE_LABEL}`]) === 0
      ? 'running'
      : 'stopped'
  }
  if (process.platform === 'linux') {
    if (!existsSync(systemdUnitPath())) {
      return 'not_installed'
    }
    return runAllowFailure(['systemctl', '--user', 'is-active', '--quiet', SYSTEMD_UNIT]) === 0
      ? 'running'
      : 'stopped'
  }
  if (process.platform === 'win32') {
    return runAllowFailure(['schtasks.exe', '/Query', '/TN', WINDOWS_TASK]) === 0
      ? 'running'
      : 'not_installed'
  }
  throw new Error('daemon_service_platform_unsupported')
}

export function scheduleWindowsDaemonServiceRestart(parentPid: number): void {
  if (process.platform !== 'win32') {
    throw new Error('daemon_service_restart_platform_invalid')
  }
  const script =
    'Wait-Process -Id $args[0] -ErrorAction SilentlyContinue; ' +
    'Start-Sleep -Milliseconds 150; schtasks.exe /Run /TN $args[1] | Out-Null'
  const child = Bun.spawn(
    [
      'powershell.exe',
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script,
      String(parentPid),
      WINDOWS_TASK
    ],
    { stderr: 'ignore', stdin: 'ignore', stdout: 'ignore' }
  )
  child.unref()
}

function installLaunchAgent(): void {
  const path = launchAgentPath()
  mkdirSync(launchLogDirectory(), { mode: 0o700, recursive: true })
  writeSecureFile(path, launchAgentDocument())
  runAllowFailure(['launchctl', 'bootout', launchDomain(), path])
  runRequired(['launchctl', 'bootstrap', launchDomain(), path])
  runRequired(['launchctl', 'enable', `${launchDomain()}/${SERVICE_LABEL}`])
}

function installSystemdUnit(): void {
  requireExecutable('systemctl')
  writeSecureFile(systemdUnitPath(), systemdUnitDocument())
  runRequired(['systemctl', '--user', 'daemon-reload'])
  runRequired(['systemctl', '--user', 'enable', '--now', SYSTEMD_UNIT])
}

function installWindowsTask(): void {
  const command = resolveDaemonServiceCommand()
  runRequired([
    'schtasks.exe',
    '/Create',
    '/F',
    '/RL',
    'LIMITED',
    '/SC',
    'ONLOGON',
    '/TN',
    WINDOWS_TASK,
    '/TR',
    windowsCommandLine([command.executable, ...command.arguments])
  ])
  runRequired(['schtasks.exe', '/Run', '/TN', WINDOWS_TASK])
}

function launchAgentDocument(): string {
  const command = resolveDaemonServiceCommand()
  const argumentsXml = [command.executable, ...command.arguments]
    .map((argument) => `    <string>${escapeXml(argument)}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(launchLogDirectory(), 'daemon.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(launchLogDirectory(), 'daemon.error.log'))}</string>
</dict>
</plist>
`
}

function systemdUnitDocument(): string {
  const command = resolveDaemonServiceCommand()
  const start = [command.executable, ...command.arguments].map(systemdQuote).join(' ')
  return `[Unit]
Description=Yiru daemon

[Service]
Type=simple
ExecStart=${start}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`
}

function launchAgentPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`)
}

function launchLogDirectory(): string {
  return join(homedir(), 'Library', 'Logs', 'Yiru')
}

function launchDomain(): string {
  if (process.getuid === undefined) {
    throw new Error('daemon_service_user_id_unavailable')
  }
  return `gui/${process.getuid()}`
}

function systemdUnitPath(): string {
  const config = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(config, 'systemd', 'user', SYSTEMD_UNIT)
}

function requireExecutable(name: string): void {
  if (!Bun.which(name)) {
    throw new Error(`daemon_service_executable_unavailable:${name}`)
  }
}

function runRequired(argumentsList: string[]): void {
  const exitCode = runAllowFailure(argumentsList)
  if (exitCode !== 0) {
    throw new Error(`daemon_service_command_failed:${argumentsList[0]}:${exitCode}`)
  }
}

function runAllowFailure(argumentsList: string[]): number {
  return Bun.spawnSync(argumentsList, { stderr: 'ignore', stdout: 'ignore' }).exitCode
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function systemdQuote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`
}

function windowsCommandLine(argumentsList: string[]): string {
  return argumentsList.map((argument) => `"${argument.replaceAll('"', '\\"')}"`).join(' ')
}
