import type { HostSectionRow } from './host-section-rows'

export function getProjectWorkspaceRows(
  rows: readonly HostSectionRow[],
  projectId: string
): HostSectionRow[] {
  return rows.filter((row) => !(row.type === 'header' && row.repo?.id === projectId))
}
