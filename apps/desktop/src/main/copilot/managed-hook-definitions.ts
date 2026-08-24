import type { HookDefinition } from '../agent-hooks/managed-hook-commands'

export function definitionHasCurrentCommand(definition: HookDefinition, command: string): boolean {
  return (
    definition.command === command ||
    definition.bash === command ||
    definition.powershell === command ||
    (Array.isArray(definition.hooks) && definition.hooks.some((hook) => hook.command === command))
  )
}

export function definitionHasStaleManagedCommand(
  definition: HookDefinition,
  currentCommand: string | null,
  isManagedCommand: (command: string | undefined) => boolean
): boolean {
  const commands = [definition.command, definition.bash, definition.powershell]
  if (commands.some((command) => isManagedCommand(command) && command !== currentCommand)) {
    return true
  }
  return (
    Array.isArray(definition.hooks) &&
    definition.hooks.some(
      (hook) => isManagedCommand(hook.command) && hook.command !== currentCommand
    )
  )
}

export function managedHookDefinitionsChanged(
  before: HookDefinition[],
  after: HookDefinition[]
): boolean {
  return (
    before.length !== after.length ||
    after.some((definition, index) => definition !== before[index])
  )
}
