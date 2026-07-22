import type { WorkspacePanelTabContentType } from './types'

const WORKSPACE_PANEL_TAB_CONTENT_TYPES = new Set<WorkspacePanelTabContentType>([
  'explorer',
  'vault',
  'workspaces',
  'pr-checks',
  'source-control',
  'checks',
  'ports'
])

export function isWorkspacePanelTabContentType(
  value: string
): value is WorkspacePanelTabContentType {
  return WORKSPACE_PANEL_TAB_CONTENT_TYPES.has(value as WorkspacePanelTabContentType)
}
