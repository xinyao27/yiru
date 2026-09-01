import type { NotificationReportInput } from '@yiru/runtime-protocol/contract'

type NotificationShellAttentionSignal = () => void

let signalShellAttention: NotificationShellAttentionSignal = () => undefined

export function setNotificationShellAttentionSignal(
  signal: NotificationShellAttentionSignal
): void {
  signalShellAttention = signal
}

// Why: tray attention is a shell-only, fire-and-forget cue that must happen
// before notification settings and cooldown gates suppress a later display.
export function signalNotificationShellAttention(source: NotificationReportInput['source']): void {
  if (source === 'agent-task-complete' || source === 'terminal-bell') {
    signalShellAttention()
  }
}
