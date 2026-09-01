const TERMINAL_MULTIPLEX_STALL_CHECK_MS = 500

type TerminalMultiplexStallMonitorOptions = {
  hasInFlightOutput: () => boolean
  isStalled: () => boolean
  onStall: () => void
}

export type TerminalMultiplexStallMonitor = {
  clear: () => void
  schedule: () => void
}

export function createTerminalMultiplexStallMonitor(
  options: TerminalMultiplexStallMonitorOptions
): TerminalMultiplexStallMonitor {
  let timer: ReturnType<typeof setTimeout> | null = null

  function clear(): void {
    if (!timer) {
      return
    }
    clearTimeout(timer)
    timer = null
  }

  function schedule(): void {
    if (timer || !options.hasInFlightOutput()) {
      return
    }
    timer = setTimeout(check, TERMINAL_MULTIPLEX_STALL_CHECK_MS)
    timer.unref?.()
  }

  function check(): void {
    timer = null
    if (options.isStalled()) {
      options.onStall()
      return
    }
    schedule()
  }

  return { clear, schedule }
}
