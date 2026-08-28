import { requireSuccessfulResponse } from './messages'

export async function publishProjectCatalog(
  projects: { displayName: string; projectId: string }[]
): Promise<void> {
  await requireSuccessfulResponse(
    await chrome.runtime.sendMessage({ projects, type: 'project-group-catalog' })
  )
}

export async function publishWorkspacePortClaims(
  claims: { displayName: string; port: number; projectId: string; worktreeId: string }[]
): Promise<void> {
  await requireSuccessfulResponse(
    await chrome.runtime.sendMessage({ claims, type: 'workspace-port-claims' })
  )
}
