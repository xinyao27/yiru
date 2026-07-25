import type { CommandSpec } from '../args'
import { AGENT_HOOK_COMMAND_SPECS } from './agent-hooks'
import { AUTOMATION_COMMAND_SPECS } from './automations'
import { BROWSER_ADVANCED_COMMAND_SPECS } from './browser-advanced'
import { BROWSER_BASIC_COMMAND_SPECS } from './browser-basic'
import { COMPUTER_COMMAND_SPECS } from './computer'
import { CORE_COMMAND_SPECS } from './core'
import { DIAGNOSTICS_COMMAND_SPECS } from './diagnostics'
import { EMULATOR_COMMAND_SPECS } from './emulator'
import { ENVIRONMENT_COMMAND_SPECS } from './environment'
import { FILE_COMMAND_SPECS } from './file'
import { INTROSPECTION_COMMAND_SPECS } from './introspection'
import { ORCHESTRATION_COMMAND_SPECS } from './orchestration'
import { PROJECT_COMMAND_SPECS } from './project'
import { SESSION_COMMAND_SPECS } from './sessions'
import { SKILL_COMMAND_SPECS } from './skills'
import { VM_COMMAND_SPECS } from './vm'

export const COMMAND_SPECS: CommandSpec[] = [
  ...CORE_COMMAND_SPECS,
  ...PROJECT_COMMAND_SPECS,
  ...SESSION_COMMAND_SPECS,
  ...FILE_COMMAND_SPECS,
  ...AUTOMATION_COMMAND_SPECS,
  ...BROWSER_BASIC_COMMAND_SPECS,
  ...BROWSER_ADVANCED_COMMAND_SPECS,
  ...ORCHESTRATION_COMMAND_SPECS,
  ...COMPUTER_COMMAND_SPECS,
  ...AGENT_HOOK_COMMAND_SPECS,
  ...DIAGNOSTICS_COMMAND_SPECS,
  ...INTROSPECTION_COMMAND_SPECS,
  ...ENVIRONMENT_COMMAND_SPECS,
  ...VM_COMMAND_SPECS,
  ...EMULATOR_COMMAND_SPECS,
  ...SKILL_COMMAND_SPECS
]
