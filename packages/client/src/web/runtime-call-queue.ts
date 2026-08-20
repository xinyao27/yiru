const WEB_RUNTIME_CALL_CONCURRENCY = 8
const WEB_RUNTIME_BACKGROUND_CALL_CONCURRENCY = 2

export type WebRuntimeCallPriority = 'foreground' | 'background'

type QueuedWebRuntimeCall<T> = {
  priority: WebRuntimeCallPriority
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

type WebRuntimeCallQueue = {
  active: number
  backgroundActive: number
  foreground: QueuedWebRuntimeCall<unknown>[]
  foregroundHead: number
  background: QueuedWebRuntimeCall<unknown>[]
  backgroundHead: number
}

export class WebRuntimeCallQueuePool {
  private readonly queues = new Map<string, WebRuntimeCallQueue>()

  enqueue<T>(
    selector: string,
    priority: WebRuntimeCallPriority,
    run: () => Promise<T>
  ): Promise<T> {
    const queue = this.getQueue(selector)
    return new Promise<T>((resolve, reject) => {
      const call: QueuedWebRuntimeCall<T> = { priority, run, resolve, reject }
      const target = priority === 'background' ? queue.background : queue.foreground
      target.push(call as QueuedWebRuntimeCall<unknown>)
      this.pump(selector, queue)
    })
  }

  private getQueue(selector: string): WebRuntimeCallQueue {
    let queue = this.queues.get(selector)
    if (!queue) {
      queue = {
        active: 0,
        backgroundActive: 0,
        foreground: [],
        foregroundHead: 0,
        background: [],
        backgroundHead: 0
      }
      this.queues.set(selector, queue)
    }
    return queue
  }

  private pump(selector: string, queue: WebRuntimeCallQueue): void {
    while (queue.active < WEB_RUNTIME_CALL_CONCURRENCY) {
      let call = this.takeForeground(queue)
      if (!call && queue.backgroundActive < WEB_RUNTIME_BACKGROUND_CALL_CONCURRENCY) {
        call = this.takeBackground(queue)
      }
      if (!call) {
        break
      }

      queue.active += 1
      if (call.priority === 'background') {
        queue.backgroundActive += 1
      }
      let runPromise: Promise<unknown>
      try {
        runPromise = call.run()
      } catch (error) {
        runPromise = Promise.reject(error)
      }
      void runPromise.then(call.resolve, call.reject).finally(() => {
        queue.active = Math.max(0, queue.active - 1)
        if (call.priority === 'background') {
          queue.backgroundActive = Math.max(0, queue.backgroundActive - 1)
        }
        if (queue.active === 0 && this.isEmpty(queue)) {
          this.queues.delete(selector)
          return
        }
        this.pump(selector, queue)
      })
    }
  }

  private takeForeground(queue: WebRuntimeCallQueue): QueuedWebRuntimeCall<unknown> | undefined {
    if (queue.foregroundHead >= queue.foreground.length) {
      return undefined
    }
    const call = queue.foreground[queue.foregroundHead]
    queue.foregroundHead += 1
    this.compactForeground(queue)
    return call
  }

  private takeBackground(queue: WebRuntimeCallQueue): QueuedWebRuntimeCall<unknown> | undefined {
    if (queue.backgroundHead >= queue.background.length) {
      return undefined
    }
    const call = queue.background[queue.backgroundHead]
    queue.backgroundHead += 1
    this.compactBackground(queue)
    return call
  }

  private compactForeground(queue: WebRuntimeCallQueue): void {
    if (queue.foregroundHead <= 32 || queue.foregroundHead * 2 < queue.foreground.length) {
      return
    }
    // Why: head indexes avoid O(n) shifts during large remote refresh bursts.
    queue.foreground.splice(0, queue.foregroundHead)
    queue.foregroundHead = 0
  }

  private compactBackground(queue: WebRuntimeCallQueue): void {
    if (queue.backgroundHead <= 32 || queue.backgroundHead * 2 < queue.background.length) {
      return
    }
    queue.background.splice(0, queue.backgroundHead)
    queue.backgroundHead = 0
  }

  private isEmpty(queue: WebRuntimeCallQueue): boolean {
    return (
      queue.foregroundHead >= queue.foreground.length &&
      queue.backgroundHead >= queue.background.length
    )
  }
}
