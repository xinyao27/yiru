import type { AgentPhase } from '@yiru/runtime-protocol/contract'
import { getRepoIdFromWorktreeId } from '@yiru/runtime-protocol/model/workspace'

import type { WorkspaceEventLog } from '../events/log'
import { translate } from '../i18n/translate'

const POWERSHELL_TOAST = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$title = [Security.SecurityElement]::Escape($env:YIRU_TOAST_TITLE)
$body = [Security.SecurityElement]::Escape($env:YIRU_TOAST_BODY)
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual></toast>")
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Yiru').Show($toast)
`.trim()

export class NativeNotificationService {
  private readonly events: WorkspaceEventLog
  private readonly hasChromeClient: () => boolean

  constructor(events: WorkspaceEventLog, hasChromeClient: () => boolean) {
    this.events = events
    this.hasChromeClient = hasChromeClient
  }

  publish(input: {
    phase: AgentPhase
    terminal: string
    title: string | null
    worktreeId: string
  }): void {
    if (this.hasChromeClient() || !['waiting-decision', 'complete'].includes(input.phase)) {
      return
    }
    const projectId = getRepoIdFromWorktreeId(input.worktreeId)
    const title =
      input.phase === 'waiting-decision'
        ? translate('Yiru needs your decision')
        : translate('Yiru agent completed')
    const body = input.title || translate('Open Yiru to review the agent session')
    const result = sendNativeNotification(title, body)
    this.events.append(
      projectId,
      result.sent ? 'notification.native.sent' : 'notification.native.unavailable',
      {
        phase: input.phase,
        platform: process.platform,
        terminal: input.terminal
      }
    )
  }
}

function sendNativeNotification(title: string, body: string): { sent: boolean } {
  if (process.platform === 'darwin') {
    const script =
      'on run argv\n display notification (item 2 of argv) with title (item 1 of argv)\nend run'
    return spawnNotification('osascript', ['-e', script, title, body])
  }
  if (process.platform === 'linux') {
    return spawnNotification('notify-send', ['--app-name=Yiru', title, body])
  }
  if (process.platform === 'win32') {
    return spawnNotification(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_TOAST],
      { YIRU_TOAST_BODY: body, YIRU_TOAST_TITLE: title }
    )
  }
  return { sent: false }
}

function spawnNotification(
  executable: string,
  args: string[],
  extraEnvironment: Record<string, string> = {}
): { sent: boolean } {
  if (!Bun.which(executable)) {
    return { sent: false }
  }
  const result = Bun.spawnSync([executable, ...args], {
    env: { ...process.env, ...extraEnvironment },
    stderr: 'ignore',
    stdout: 'ignore'
  })
  return { sent: result.exitCode === 0 }
}
