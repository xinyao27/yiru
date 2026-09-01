import { resolvePtySignal } from './spawn-command'

type Disposable = {
  dispose: () => void
}

export type BunHiddenCommandPty = {
  destroy: () => void
  kill: (signal?: string) => void
  onData: (callback: (data: string) => void) => Disposable
  onExit: (callback: () => void) => Disposable
  write: (data: string) => void
}

export type BunHiddenCommandPtyLaunch = {
  args: string[]
  cols: number
  cwd: string
  env: Record<string, string>
  file: string
  name: string
  rows: number
}

export function spawnBunHiddenCommandPty(
  launch: BunHiddenCommandPtyLaunch
): Promise<BunHiddenCommandPty> {
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<() => void>()
  const decoder = new TextDecoder()
  let exitCode: number | null = null
  const terminal = new Bun.Terminal({
    cols: launch.cols,
    data: (_terminal, bytes) => {
      emitData(decoder.decode(bytes, { stream: true }))
    },
    name: launch.name,
    rows: launch.rows
  })
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([launch.file, ...launch.args], {
      cwd: launch.cwd,
      env: launch.env,
      terminal
    })
  } catch (error) {
    terminal.close()
    throw error
  }

  void child.exited.then((code) => {
    emitData(decoder.decode())
    exitCode = code
    if (!terminal.closed) {
      terminal.close()
    }
    for (const listener of exitListeners) {
      listener()
    }
    exitListeners.clear()
    dataListeners.clear()
  })

  function emitData(data: string): void {
    if (!data) {
      return
    }
    for (const listener of dataListeners) {
      listener(data)
    }
  }

  return Promise.resolve({
    destroy: () => {
      if (!terminal.closed) {
        terminal.close()
      }
    },
    kill: (signal = 'SIGTERM') => {
      if (exitCode === null) {
        child.kill(resolvePtySignal(signal))
      }
    },
    onData: (callback) => {
      dataListeners.add(callback)
      return { dispose: () => dataListeners.delete(callback) }
    },
    onExit: (callback) => {
      if (exitCode !== null) {
        queueMicrotask(callback)
        return { dispose: () => {} }
      }
      exitListeners.add(callback)
      return { dispose: () => exitListeners.delete(callback) }
    },
    write: (data) => terminal.write(data)
  })
}
