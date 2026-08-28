export class PaneReparentFrameTracker {
  private readonly frameIds = new Set<number>()

  request(callback: FrameRequestCallback, isDisposed: () => boolean): void {
    let completed = false
    let frameId: number | undefined
    frameId = requestAnimationFrame((timestamp) => {
      completed = true
      if (frameId !== undefined) {
        this.frameIds.delete(frameId)
      }
      if (!isDisposed()) {
        callback(timestamp)
      }
    })
    if (!completed) {
      this.frameIds.add(frameId)
    }
  }

  cancelAll(): void {
    for (const frameId of this.frameIds) {
      cancelAnimationFrame(frameId)
    }
    this.frameIds.clear()
  }
}
