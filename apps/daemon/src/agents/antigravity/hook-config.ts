import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  hookDefinitionHasManagedCommand,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  removeManagedCommands,
  type HookDefinition,
  type HooksConfig
} from '../hooks/managed-hook-commands'
import {
  ANTIGRAVITY_EVENTS,
  ANTIGRAVITY_MANAGED_SCRIPT_FILE_NAMES,
  type AntigravityEvent
} from './hook-events'

const ANTIGRAVITY_HOOK_BUNDLE_NAME = 'yiru-status'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getHookDefinitions(value: unknown): HookDefinition[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function getAntigravityHookBundle(config: HooksConfig): Record<string, unknown> {
  const existing = config[ANTIGRAVITY_HOOK_BUNDLE_NAME]
  return isRecord(existing) ? { ...existing } : {}
}

export function antigravityBundleHasCommand(
  definitions: HookDefinition[],
  command: string
): boolean {
  return definitions.some(
    (definition) =>
      definition.command === command ||
      (Array.isArray(definition.hooks) && definition.hooks.some((hook) => hook.command === command))
  )
}

export function createAntigravityManagedCommandMatcher(): (command: string | undefined) => boolean {
  const matchers = ANTIGRAVITY_MANAGED_SCRIPT_FILE_NAMES.map(createManagedCommandMatcher)
  return (command) => matchers.some((matcher) => matcher(command))
}

export function antigravityBundleHasStaleCommand(
  bundle: Record<string, unknown>,
  isManagedCommand: (command: string | undefined) => boolean,
  currentCommands: ReadonlySet<string>
): boolean {
  for (const value of Object.values(bundle)) {
    for (const definition of getHookDefinitions(value)) {
      if (!hookDefinitionHasManagedCommand(definition, isManagedCommand)) {
        continue
      }
      const commands = [
        definition.command,
        definition.bash,
        definition.powershell,
        ...(Array.isArray(definition.hooks) ? definition.hooks.map((hook) => hook.command) : [])
      ]
      if (
        commands.some(
          (command) =>
            command !== undefined && isManagedCommand(command) && !currentCommands.has(command)
        )
      ) {
        return true
      }
    }
  }
  return false
}

function buildEventDefinition(event: AntigravityEvent, command: string): HookDefinition {
  return event.schema === 'tool'
    ? { matcher: '*', hooks: [buildManagedCommandHook(command)] }
    : { type: 'command', command, timeout: MANAGED_HOOK_TIMEOUT_SECONDS }
}

function removeManagedCommandsFromBundle(
  bundle: Record<string, unknown>,
  isManagedCommand: (command: string | undefined) => boolean
): Record<string, unknown> {
  const next = { ...bundle }
  for (const [eventName, value] of Object.entries(next)) {
    const definitions = getHookDefinitions(value)
    if (!Array.isArray(value)) {
      continue
    }
    const cleaned = removeManagedCommands(definitions, isManagedCommand)
    if (cleaned.length === 0) {
      delete next[eventName]
    } else {
      next[eventName] = cleaned
    }
  }
  return next
}

export function installAntigravityHookConfig(
  config: HooksConfig,
  commandForEvent: (event: AntigravityEvent) => string,
  isManagedCommand: (command: string | undefined) => boolean
): void {
  const bundle = removeManagedCommandsFromBundle(getAntigravityHookBundle(config), isManagedCommand)
  for (const event of ANTIGRAVITY_EVENTS) {
    const cleaned = removeManagedCommands(
      getHookDefinitions(bundle[event.eventName]),
      isManagedCommand
    )
    bundle[event.eventName] = [...cleaned, buildEventDefinition(event, commandForEvent(event))]
  }
  config[ANTIGRAVITY_HOOK_BUNDLE_NAME] = bundle
}

export function removeAntigravityHookConfig(config: HooksConfig): void {
  const bundle = removeManagedCommandsFromBundle(
    getAntigravityHookBundle(config),
    createAntigravityManagedCommandMatcher()
  )
  if (Object.keys(bundle).length === 0) {
    delete config[ANTIGRAVITY_HOOK_BUNDLE_NAME]
  } else {
    config[ANTIGRAVITY_HOOK_BUNDLE_NAME] = bundle
  }
}

export function getAntigravityHookDefinitions(value: unknown): HookDefinition[] {
  return getHookDefinitions(value)
}
