import type { KeybindingActionId } from '@yiru/runtime-protocol/workbench/keybindings'

export function clearRecordingActionForShortcutMutation(
  recordingActionId: KeybindingActionId | null,
  actionId: KeybindingActionId
): KeybindingActionId | null {
  return recordingActionId === actionId ? null : recordingActionId
}
