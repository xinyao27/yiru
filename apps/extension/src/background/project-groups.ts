const PROJECT_CATALOG_KEY = 'projectGroupCatalog.v1'
const PROJECT_GROUP_IDS_KEY = 'projectGroupIds.v1'

type ProjectCatalogEntry = {
  displayName: string
  projectId: string
}

type Respond = (response: unknown) => void

export function handleProjectCatalogMessage(message: object, respond: Respond): boolean | null {
  if (Reflect.get(message, 'type') !== 'project-group-catalog') {
    return null
  }
  const projects = parseProjectCatalog(Reflect.get(message, 'projects'))
  if (!projects) {
    respond({ error: 'project_group_catalog_invalid', ok: false })
    return false
  }
  void saveProjectCatalog(projects).then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

export async function addTabToProjectGroup(
  tabId: number | undefined,
  projectId: string,
  displayName?: string
): Promise<void> {
  if (tabId === undefined) {
    return
  }
  const tab = await chrome.tabs.get(tabId)
  if (tab.windowId === undefined) {
    return
  }
  const groupId = await findProjectGroup(projectId, tab.windowId)
  const nextGroupId = await groupTab(tabId, groupId)
  await rememberProjectGroup(projectId, tab.windowId, nextGroupId)
  const title = displayName?.trim() || (await readProjectName(projectId)) || projectId
  await chrome.tabGroups.update(nextGroupId, { color: 'blue', title: title.slice(0, 80) })
}

export async function readProjectName(projectId: string): Promise<string | null> {
  const catalog = await readStringRecord(PROJECT_CATALOG_KEY)
  return catalog[projectId] ?? null
}

export async function restoreProjectGroupMappings(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const observed = new Map<string, number | null>()
  for (const tab of tabs) {
    const projectId = workspaceProjectId(tab.url)
    if (!projectId || tab.groupId < 0 || tab.windowId === undefined) {
      continue
    }
    const key = projectGroupKey(projectId, tab.windowId)
    const current = observed.get(key)
    observed.set(key, current === undefined || current === tab.groupId ? tab.groupId : null)
  }
  const mappings = Object.fromEntries(
    [...observed].flatMap(([key, groupId]) => (groupId === null ? [] : [[key, groupId]]))
  )
  await chrome.storage.session.set({ [PROJECT_GROUP_IDS_KEY]: mappings })
}

export async function updateProjectGroupActivity(
  previousProjectIds: readonly string[],
  activeProjectIds: readonly string[]
): Promise<void> {
  const previous = new Set(previousProjectIds)
  const active = new Set(activeProjectIds)
  const changed = new Map<string, boolean>()
  for (const projectId of previous) {
    if (!active.has(projectId)) {
      changed.set(projectId, true)
    }
  }
  for (const projectId of active) {
    if (!previous.has(projectId)) {
      changed.set(projectId, false)
    }
  }
  if (changed.size === 0) {
    return
  }
  const storedGroupIds = await readNumberRecord(PROJECT_GROUP_IDS_KEY)
  await Promise.all(
    Object.entries(storedGroupIds).flatMap(([key, groupId]) => {
      const projectId = key.slice(key.indexOf(':') + 1)
      const collapsed = changed.get(projectId)
      return collapsed === undefined
        ? []
        : [chrome.tabGroups.update(groupId, { collapsed }).catch(() => undefined)]
    })
  )
}

async function saveProjectCatalog(projects: ProjectCatalogEntry[]): Promise<void> {
  const catalog = Object.fromEntries(
    projects.map((project) => [project.projectId, project.displayName.trim()])
  )
  await chrome.storage.session.set({ [PROJECT_CATALOG_KEY]: catalog })
  await updateExistingGroupTitles(catalog)
}

async function updateExistingGroupTitles(catalog: Record<string, string>): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const updates = new Map<number, string>()
  for (const tab of tabs) {
    const projectId = workspaceProjectId(tab.url)
    if (projectId && tab.groupId >= 0 && catalog[projectId]) {
      updates.set(tab.groupId, catalog[projectId])
    }
  }
  const storedGroupIds = await readNumberRecord(PROJECT_GROUP_IDS_KEY)
  for (const [key, groupId] of Object.entries(storedGroupIds)) {
    const projectId = key.slice(key.indexOf(':') + 1)
    if (catalog[projectId]) {
      updates.set(groupId, catalog[projectId])
    }
  }
  await Promise.all(
    [...updates].map(([groupId, title]) =>
      chrome.tabGroups.update(groupId, { title: title.slice(0, 80) }).catch(() => undefined)
    )
  )
}

async function findProjectGroup(projectId: string, windowId: number): Promise<number | null> {
  const key = projectGroupKey(projectId, windowId)
  const storedGroupId = (await readNumberRecord(PROJECT_GROUP_IDS_KEY))[key]
  if (storedGroupId !== undefined) {
    const group = await chrome.tabGroups.get(storedGroupId).catch(() => null)
    if (group?.windowId === windowId) {
      return storedGroupId
    }
  }
  const tabs = await chrome.tabs.query({
    url: `${chrome.runtime.getURL('workspace.html')}*`,
    windowId
  })
  return (
    tabs.find((tab) => tab.groupId >= 0 && workspaceProjectId(tab.url) === projectId)?.groupId ??
    null
  )
}

async function groupTab(tabId: number, groupId: number | null): Promise<number> {
  if (groupId === null) {
    return chrome.tabs.group({ tabIds: [tabId] })
  }
  return chrome.tabs
    .group({ groupId, tabIds: [tabId] })
    .catch(() => chrome.tabs.group({ tabIds: [tabId] }))
}

async function rememberProjectGroup(
  projectId: string,
  windowId: number,
  groupId: number
): Promise<void> {
  const groups = await readNumberRecord(PROJECT_GROUP_IDS_KEY)
  groups[projectGroupKey(projectId, windowId)] = groupId
  await chrome.storage.session.set({ [PROJECT_GROUP_IDS_KEY]: groups })
}

function projectGroupKey(projectId: string, windowId: number): string {
  return `${windowId}:${projectId}`
}

function workspaceProjectId(rawUrl: string | undefined): string | null {
  if (!rawUrl) {
    return null
  }
  try {
    return new URL(rawUrl).searchParams.get('project')
  } catch {
    return null
  }
}

function parseProjectCatalog(value: unknown): ProjectCatalogEntry[] | null {
  if (!Array.isArray(value) || value.length > 1_000) {
    return null
  }
  const projects: ProjectCatalogEntry[] = []
  for (const entry of value) {
    const displayName =
      typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'displayName') : null
    const projectId =
      typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'projectId') : null
    if (
      typeof displayName !== 'string' ||
      !displayName.trim() ||
      displayName.length > 200 ||
      typeof projectId !== 'string' ||
      !projectId.trim() ||
      projectId.length > 200
    ) {
      return null
    }
    projects.push({ displayName, projectId })
  }
  return projects
}

async function readStringRecord(key: string): Promise<Record<string, string>> {
  const stored: unknown = await chrome.storage.session.get(key)
  const value = typeof stored === 'object' && stored !== null ? Reflect.get(stored, key) : null
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

async function readNumberRecord(key: string): Promise<Record<string, number>> {
  const stored: unknown = await chrome.storage.session.get(key)
  const value = typeof stored === 'object' && stored !== null ? Reflect.get(stored, key) : null
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
  )
}
