import { ipcRenderer, webUtils } from 'electron'
import {
  createNativeFileDropPayload,
  createRejectedNativeFileDropPayload,
  hasNativeFileDragTypes,
  NATIVE_FILE_DROP_CHANNEL,
  NATIVE_FILE_DROP_MAX_PATHS,
  resolveNativeFileDropPath,
  YIRU_INTERNAL_FILE_DRAG_TYPE,
  type NativeDropResolution,
  type NativeFileDropPathEntry
} from '~shared/native-file-drop'

function resolveDropTarget(event: DragEvent): NativeDropResolution | null {
  const entries: NativeFileDropPathEntry[] = []
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement) {
      entries.push({
        nativeFileDropTarget: entry.dataset.nativeFileDropTarget,
        nativeFileDropDir: entry.dataset.nativeFileDropDir,
        terminalTabId: entry.dataset.terminalTabId,
        terminalPaneLeafId: entry.dataset.terminalPaneLeafId ?? entry.dataset.leafId
      })
    }
  }
  return resolveNativeFileDropPath(entries)
}

function onDragOver(event: DragEvent): void {
  if (event.dataTransfer && !hasNativeFileDragTypes(event.dataTransfer.types)) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDrop(event: DragEvent): void {
  if (event.dataTransfer?.types.includes(YIRU_INTERNAL_FILE_DRAG_TYPE)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) {
    return
  }
  if (files.length > NATIVE_FILE_DROP_MAX_PATHS) {
    ipcRenderer.send(
      NATIVE_FILE_DROP_CHANNEL,
      createRejectedNativeFileDropPayload({
        byteLength: 0,
        pathCount: files.length,
        reason: 'too-many-paths',
        status: 'rejected'
      })
    )
    return
  }

  const paths = Array.from(files).flatMap((file) => {
    const path = webUtils.getPathForFile(file)
    return path ? [path] : []
  })
  if (paths.length === 0) {
    return
  }
  const payload = createNativeFileDropPayload(resolveDropTarget(event), paths)
  if (payload) {
    ipcRenderer.send(NATIVE_FILE_DROP_CHANNEL, payload)
  }
}

// Why: only Electron's isolated preload can turn a native DOM File into its
// real absolute path. This one-way gesture adapter exposes no callable API.
export function installNativeFileDropAdapter(): void {
  document.addEventListener('dragover', onDragOver, true)
  document.addEventListener('drop', onDrop, true)
}
