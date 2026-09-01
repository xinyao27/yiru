const RECENT_PROJECTS_KEY = 'recentProjectIds'

export async function rememberProject(projectId: string): Promise<void> {
  const current = await readRecentProjects()
  await chrome.storage.local.set({
    [RECENT_PROJECTS_KEY]: [projectId, ...current.filter((entry) => entry !== projectId)].slice(
      0,
      20
    )
  })
}

export async function readRecentProjects(): Promise<string[]> {
  const stored: unknown = await chrome.storage.local.get(RECENT_PROJECTS_KEY)
  const value =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, RECENT_PROJECTS_KEY) : null
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : []
}
