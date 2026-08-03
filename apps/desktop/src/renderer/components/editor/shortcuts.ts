import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { getShortcutPlatform } from '~renderer/lib/shortcut-platform'
import { useAppStore } from '~renderer/store'
import { keybindingMatchesAction, type KeybindingActionId } from '~shared/keybindings'

export function editorShortcutMatches(
  actionId: KeybindingActionId,
  event: KeyboardEvent | ReactKeyboardEvent
): boolean {
  return keybindingMatchesAction(
    actionId,
    event,
    getShortcutPlatform(),
    useAppStore.getState().keybindings
  )
}
