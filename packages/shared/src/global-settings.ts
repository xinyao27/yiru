import type { GlobalAgentSettings } from './global-settings-agents'
import type { GlobalExperimentalSettings } from './global-settings-experimental'
import type { GlobalTerminalSettings } from './global-settings-terminal'
import type { GlobalWorkbenchSettings } from './global-settings-workbench'
import type { GlobalWorkspaceSettings } from './global-settings-workspace'

export type GlobalSettings = GlobalWorkspaceSettings &
  GlobalTerminalSettings &
  GlobalWorkbenchSettings &
  GlobalAgentSettings &
  GlobalExperimentalSettings
