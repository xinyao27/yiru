import { basename } from '@/lib/path'

const MAX_SHOWN_DRAG_PATHS = 5
const FILE_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><polyline points="14 2 14 8 20 8"/></svg>'

function createDragPreviewRow(label: string, width: number, faded = false): HTMLDivElement {
  const row = document.createElement('div')
  row.style.cssText = `display:flex;align-items:center;gap:4px;height:26px;padding:4px 8px;width:${width}px;box-sizing:border-box;font-size:12px;border-radius:2px;background:var(--accent);color:var(--accent-foreground);${faded ? 'opacity:0.6;' : ''}`
  const spacer = document.createElement('span')
  spacer.style.cssText = 'width:12px;height:12px;flex-shrink:0;'
  row.appendChild(spacer)
  const icon = document.createElement('span')
  icon.style.cssText =
    'width:12px;height:12px;flex-shrink:0;display:flex;align-items:center;color:var(--muted-foreground);'
  icon.innerHTML = FILE_ICON
  row.appendChild(icon)
  const name = document.createElement('span')
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  name.textContent = label
  row.appendChild(name)
  return row
}

export function setMultiPathDragPreview(event: React.DragEvent, paths: string[]): void {
  if (paths.length <= 1) {
    return
  }
  const width = event.currentTarget.getBoundingClientRect().width
  const ghost = document.createElement('div')
  ghost.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;pointer-events:none;display:flex;flex-direction:column;gap:1px;'

  for (const path of paths.slice(0, MAX_SHOWN_DRAG_PATHS)) {
    ghost.appendChild(createDragPreviewRow(basename(path), width))
  }
  if (paths.length > MAX_SHOWN_DRAG_PATHS) {
    ghost.appendChild(
      createDragPreviewRow(`+${paths.length - MAX_SHOWN_DRAG_PATHS} more`, width, true)
    )
  }

  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(ghost, 12, 12)
  setTimeout(() => document.body.removeChild(ghost), 0)
}
