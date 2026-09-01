import { buildWorkspaceUrl, workspaceTabProjectId } from './workspace-navigation'

type Respond = (response: unknown) => void

export function handleWindowLayoutMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (type !== 'focus-workspace-window' && type !== 'arrange-workspace-windows') {
    return null
  }
  const projectIds = parseProjectIds(
    type === 'focus-workspace-window'
      ? [Reflect.get(message, 'projectId')]
      : Reflect.get(message, 'projectIds')
  )
  const mode = Reflect.get(message, 'mode')
  if (!projectIds || (type === 'arrange-workspace-windows' && !isLayoutMode(mode))) {
    respond({ error: 'window_layout_request_invalid', ok: false })
    return false
  }
  const task =
    type === 'focus-workspace-window'
      ? openFocusWindow(projectIds[0] ?? '')
      : arrangeWindows(projectIds, mode === 'displays' ? 'displays' : 'cascade')
  void task.then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

async function openFocusWindow(projectId: string): Promise<void> {
  const tab = await projectTab(projectId)
  const current = await chrome.windows.getCurrent()
  const width = Math.max(640, Math.min(1_100, current.width ?? 1_100))
  const height = Math.max(480, Math.min(800, current.height ?? 800))
  await chrome.windows.create({
    focused: true,
    height,
    left: (current.left ?? 0) + 40,
    ...(tab?.id === undefined ? { url: buildWorkspaceUrl({ projectId }) } : { tabId: tab.id }),
    top: (current.top ?? 0) + 40,
    type: 'popup',
    width
  })
}

async function arrangeWindows(projectIds: string[], mode: 'cascade' | 'displays'): Promise<void> {
  const displays =
    mode === 'displays'
      ? await chrome.system.display.getInfo()
      : [{ workArea: await currentWindowBounds() }]
  if (displays.length === 0) {
    throw new Error('display_layout_unavailable')
  }
  for (let index = 0; index < projectIds.length; index += 1) {
    const projectId = projectIds[index] ?? ''
    const display = displays[index % displays.length]
    if (!display) {
      continue
    }
    const offset = mode === 'cascade' ? index * 32 : Math.floor(index / displays.length) * 32
    const width = Math.max(640, Math.floor(display.workArea.width * 0.72))
    const height = Math.max(480, Math.floor(display.workArea.height * 0.78))
    const tab = await projectTab(projectId)
    await chrome.windows.create({
      focused: index === 0,
      height,
      left: display.workArea.left + offset,
      ...(tab?.id === undefined ? { url: buildWorkspaceUrl({ projectId }) } : { tabId: tab.id }),
      top: display.workArea.top + offset,
      type: 'popup',
      width
    })
  }
}

async function projectTab(projectId: string): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  return tabs.find((tab) => workspaceTabProjectId(tab.url) === projectId) ?? null
}

async function currentWindowBounds(): Promise<chrome.system.display.Bounds> {
  const window = await chrome.windows.getCurrent()
  return {
    height: window.height ?? 800,
    left: window.left ?? 0,
    top: window.top ?? 0,
    width: window.width ?? 1_100
  }
}

function parseProjectIds(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 50 &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0)
    ? [...new Set(value)]
    : null
}

function isLayoutMode(value: unknown): value is 'cascade' | 'displays' {
  return value === 'cascade' || value === 'displays'
}
