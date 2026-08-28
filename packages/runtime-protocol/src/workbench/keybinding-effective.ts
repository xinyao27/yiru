import { DEFINITIONS_BY_ID, isDigitIndexActionId } from './keybinding-definitions'
import type {
  KeybindingActionId,
  KeybindingDefinition,
  KeybindingMatchOptions,
  KeybindingOverrides,
  TerminalShortcutPolicy
} from './keybinding-model'
import {
  canonicalizeDigitIndexBinding,
  normalizeOptionsForAction
} from './keybinding-normalization'
import { getKeybindingPlatform } from './keybinding-platform'
import { normalizeKeybindingWithOptions } from './keybinding-syntax'

export function getDefaultBindings(
  definition: KeybindingDefinition,
  platform: NodeJS.Platform
): string[] {
  return definition.defaultBindings[getKeybindingPlatform(platform)].map((binding) => {
    const normalized = normalizeKeybindingWithOptions(binding, {
      allowBareKeybindings: definition.allowBareKeybindings === true
    })
    return normalized.ok ? normalized.value : binding
  })
}

export function getEffectiveKeybindingsForAction(
  actionId: KeybindingActionId,
  platform: NodeJS.Platform,
  overrides?: KeybindingOverrides
): string[] {
  const definition = DEFINITIONS_BY_ID.get(actionId)
  if (!definition) {
    return []
  }
  const override = overrides?.[actionId]
  if (Array.isArray(override)) {
    // Why: digit-index overrides resolve to their canonical <mods>+1 representative
    // (deduped) so effective bindings stay consistent for display and conflict
    // detection even if a hand-edited file stored a different digit.
    if (isDigitIndexActionId(actionId)) {
      const canonical: string[] = []
      for (const binding of override) {
        const normalized = canonicalizeDigitIndexBinding(binding)
        if (normalized.ok && !canonical.includes(normalized.value)) {
          canonical.push(normalized.value)
        }
      }
      return canonical
    }
    return override.flatMap((binding) => {
      const normalized = normalizeKeybindingWithOptions(
        binding,
        normalizeOptionsForAction(actionId)
      )
      return normalized.ok ? [normalized.value] : []
    })
  }
  return getDefaultBindings(definition, platform)
}

export function getKeybindingDefinition(actionId: KeybindingActionId): KeybindingDefinition | null {
  return DEFINITIONS_BY_ID.get(actionId) ?? null
}

export function normalizeTerminalShortcutPolicy(
  policy: TerminalShortcutPolicy | null | undefined
): TerminalShortcutPolicy {
  return policy === 'terminal-first' ? 'terminal-first' : 'yiru-first'
}

export function isKeybindingAllowedInTerminal(definition: KeybindingDefinition): boolean {
  return definition.scope === 'terminal' || definition.allowInTerminal === true
}

export function isKeybindingPotentialTerminalConflict(definition: KeybindingDefinition): boolean {
  return definition.scope !== 'terminal' && definition.allowInTerminal !== true
}

export function keybindingIsActiveInContext(
  definition: KeybindingDefinition,
  options: KeybindingMatchOptions = {}
): boolean {
  if (options.context !== 'terminal') {
    return true
  }
  // Why: Yiru-first preserves existing app shortcut behavior inside terminals.
  // Terminal-first is the explicit escape hatch for shells and TUIs.
  if (normalizeTerminalShortcutPolicy(options.terminalShortcutPolicy) === 'yiru-first') {
    return true
  }
  return isKeybindingAllowedInTerminal(definition)
}
