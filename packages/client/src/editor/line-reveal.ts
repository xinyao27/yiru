import type { AppState } from '~renderer/store/types'

const pendingEditorLineRevealFrameIds = new Set<number>()

function cancelPendingEditorLineRevealFrames(): void {
  if (typeof cancelAnimationFrame === 'function') {
    for (const frameId of pendingEditorLineRevealFrameIds) {
      cancelAnimationFrame(frameId)
    }
  }
  pendingEditorLineRevealFrameIds.clear()
}

function trackEditorLineRevealFrameId(frameId: number): void {
  pendingEditorLineRevealFrameIds.add(frameId)
}

function requestTrackedEditorLineRevealFrame(callback: FrameRequestCallback): void {
  let completed = false
  let frameId: number | undefined
  frameId = requestAnimationFrame((timestamp) => {
    completed = true
    if (frameId !== undefined) {
      pendingEditorLineRevealFrameIds.delete(frameId)
    }
    callback(timestamp)
  })
  if (!completed) {
    trackEditorLineRevealFrameId(frameId)
  }
}

export function scheduleEditorLineReveal(
  get: () => AppState,
  filePath: string,
  line: number,
  column?: number,
  fileId?: string
): void {
  // Why: openFile can replace a preview and remount Monaco asynchronously; the
  // reveal must land after that remount or the old editor can clear it.
  cancelPendingEditorLineRevealFrames()
  get().setPendingEditorReveal(null)
  requestTrackedEditorLineRevealFrame(() => {
    requestTrackedEditorLineRevealFrame(() => {
      get().setPendingEditorReveal({
        filePath,
        fileId,
        line,
        column: column ?? 1,
        matchLength: 0
      })
    })
  })
}
