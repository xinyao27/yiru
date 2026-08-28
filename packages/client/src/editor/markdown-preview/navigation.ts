import type { MutableRefObject } from 'react'

export function getMarkdownPreviewAnchorScrollTop(
  container: Pick<HTMLElement, 'getBoundingClientRect' | 'scrollTop'>,
  target: Pick<HTMLElement, 'getBoundingClientRect'>
): number {
  const containerTop = container.getBoundingClientRect().top
  const targetTop = target.getBoundingClientRect().top
  return Math.max(0, targetTop - containerTop + container.scrollTop - 12)
}

export function cancelMarkdownPreviewEditorRevealFrames(
  frameIds: MutableRefObject<number[]>
): void {
  for (const frameId of frameIds.current) {
    cancelAnimationFrame(frameId)
  }
  frameIds.current = []
}

export function clearMarkdownPreviewTimeout(timeoutRef: MutableRefObject<number | null>): void {
  if (timeoutRef.current === null) {
    return
  }
  window.clearTimeout(timeoutRef.current)
  timeoutRef.current = null
}

export function requestMarkdownPreviewEditorRevealFrame(
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

export function parseMarkdownPreviewLineTarget(
  hash: string
): { line: number; column?: number } | null {
  if (!hash) {
    return null
  }
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash
  const match = /^L(\d+)(?:C(\d+))?$/i.exec(trimmed)
  if (!match) {
    return null
  }
  return { line: Number(match[1]), column: match[2] ? Number(match[2]) : undefined }
}

export function decodeMarkdownPreviewAnchor(rawAnchor: string): string {
  try {
    return decodeURIComponent(rawAnchor)
  } catch {
    return rawAnchor
  }
}
