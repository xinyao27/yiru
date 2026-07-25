import {
  TERMINAL_INPUT_CHUNK_MAX_BYTES,
  getTerminalInputByteLength,
  isTerminalInputTooLarge,
  iterateTerminalInputChunks
} from '../../../../shared/terminal-input'

export type SpoolTerminalMutation =
  | { method: 'terminal.input'; data: string }
  | { method: 'terminal.resize'; cols: number; rows: number }

export type SpoolTerminalMutationQueue = {
  input(data: string): boolean
  resize(cols: number, rows: number): void
  dispose(): void
}

type SpoolTerminalMutationQueueOptions = {
  inputFlushMs: number
  invoke(mutation: SpoolTerminalMutation): Promise<void>
  shouldDiscardAfterError(error: unknown): boolean
  onCapacityExceeded(): void
}

type PendingInputMutation = Extract<SpoolTerminalMutation, { method: 'terminal.input' }> & {
  bytes: number
}

type PendingMutation =
  | PendingInputMutation
  | Extract<SpoolTerminalMutation, { method: 'terminal.resize' }>

const MAX_PENDING_INPUT_BYTES = 1024 * 1024
const MAX_PENDING_MUTATIONS = 256

export function createSpoolTerminalMutationQueue(
  options: SpoolTerminalMutationQueueOptions
): SpoolTerminalMutationQueue {
  const pending: PendingMutation[] = []
  let bufferedInput = ''
  let bufferedInputBytes = 0
  let inputTimer: ReturnType<typeof setTimeout> | null = null
  let pumping = false
  let disposed = false
  let queuedInputBytes = 0

  const clearInputTimer = (): void => {
    if (inputTimer) {
      clearTimeout(inputTimer)
      inputTimer = null
    }
  }

  const enqueueInput = (data: string, bytes: number): void => {
    const tail = pending.at(-1)
    if (tail?.method === 'terminal.input' && tail.bytes + bytes <= TERMINAL_INPUT_CHUNK_MAX_BYTES) {
      tail.data += data
      tail.bytes += bytes
    } else {
      pending.push({ method: 'terminal.input', data, bytes })
    }
    void pump()
  }

  const flushInput = (): void => {
    clearInputTimer()
    const data = bufferedInput
    const bytes = bufferedInputBytes
    bufferedInput = ''
    bufferedInputBytes = 0
    if (data) {
      enqueueInput(data, bytes)
    }
  }

  const bufferInput = (data: string, bytes: number): void => {
    if (bufferedInput && bufferedInputBytes + bytes > TERMINAL_INPUT_CHUNK_MAX_BYTES) {
      flushInput()
    }
    bufferedInput += data
    bufferedInputBytes += bytes
    if (bufferedInputBytes >= TERMINAL_INPUT_CHUNK_MAX_BYTES) {
      flushInput()
    } else if (!inputTimer) {
      inputTimer = setTimeout(flushInput, options.inputFlushMs)
    }
  }

  async function pump(): Promise<void> {
    if (pumping || disposed) {
      return
    }
    pumping = true
    try {
      while (!disposed) {
        const mutation = pending.shift()
        if (!mutation) {
          break
        }
        if (mutation.method === 'terminal.input') {
          queuedInputBytes = Math.max(0, queuedInputBytes - mutation.bytes)
        }
        try {
          await options.invoke(
            mutation.method === 'terminal.input'
              ? { method: mutation.method, data: mutation.data }
              : mutation
          )
        } catch (error) {
          if (!disposed && options.shouldDiscardAfterError(error)) {
            pending.length = 0
            bufferedInput = ''
            bufferedInputBytes = 0
            queuedInputBytes = 0
            clearInputTimer()
          }
        }
      }
    } finally {
      pumping = false
      if (!disposed && pending.length > 0) {
        void pump()
      }
    }
  }

  return {
    input(data): boolean {
      if (disposed || !data || isTerminalInputTooLarge(data)) {
        return false
      }
      const bytes = getTerminalInputByteLength(data)
      const chunks = [...iterateTerminalInputChunks(data)]
      if (
        queuedInputBytes + bytes > MAX_PENDING_INPUT_BYTES ||
        pending.length + chunks.length + 2 > MAX_PENDING_MUTATIONS
      ) {
        options.onCapacityExceeded()
        return false
      }
      queuedInputBytes += bytes
      for (const chunk of chunks) {
        bufferInput(chunk, getTerminalInputByteLength(chunk))
      }
      return true
    },
    resize(cols, rows): void {
      if (disposed) {
        return
      }
      // Why: flush earlier bytes before enqueueing a viewport change so PTY
      // input and resize retain the order in which xterm emitted them.
      flushInput()
      const tail = pending.at(-1)
      if (tail?.method === 'terminal.resize') {
        tail.cols = cols
        tail.rows = rows
      } else if (pending.length >= MAX_PENDING_MUTATIONS) {
        options.onCapacityExceeded()
      } else {
        pending.push({ method: 'terminal.resize', cols, rows })
      }
      void pump()
    },
    dispose(): void {
      disposed = true
      pending.length = 0
      bufferedInput = ''
      bufferedInputBytes = 0
      queuedInputBytes = 0
      clearInputTimer()
    }
  }
}
