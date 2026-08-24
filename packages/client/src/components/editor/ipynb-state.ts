import type { MutableRefObject } from 'react'

export const NOTEBOOK_SOURCE_COMMIT_DELAY_MS = 400

export function cancelIpynbStructuralContentFrames(frameIds: MutableRefObject<number[]>): void {
  for (const frameId of frameIds.current) {
    cancelAnimationFrame(frameId)
  }
  frameIds.current = []
}

export function requestIpynbStructuralContentFrame(
  frameIds: MutableRefObject<number[]>,
  callback: FrameRequestCallback
): void {
  let completed = false
  let frameId: number | undefined
  frameId = requestAnimationFrame((timestamp) => {
    completed = true
    if (frameId !== undefined) {
      frameIds.current = frameIds.current.filter((pendingFrameId) => pendingFrameId !== frameId)
    }
    callback(timestamp)
  })
  if (!completed) {
    frameIds.current.push(frameId)
  }
}

type NotebookExecutionTrustState = {
  filePath: string
  trustedForFile: boolean
  pendingRunCellIndex: number | null
}

export function createNotebookExecutionTrustState(filePath: string): NotebookExecutionTrustState {
  return {
    filePath,
    trustedForFile: false,
    pendingRunCellIndex: null
  }
}
