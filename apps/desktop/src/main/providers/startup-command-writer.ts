import type * as pty from 'node-pty'
import { buildStartupCommandSubmission } from '~shared/startup-command-submission'

const POST_SHELL_READY_STARTUP_COMMAND_DELAY_MS = 30
const POST_SHELL_READY_STARTUP_COMMAND_FALLBACK_MS = 200

export type ShellReadySignal = {
  postMarkerBytesObserved: boolean
}

export function writeStartupCommandWhenShellReady(
  readyPromise: Promise<void | ShellReadySignal>,
  process: pty.IPty,
  startupCommand: string,
  onExit: (cleanup: () => void) => void,
  options: { bracketedPasteSafe?: boolean } = {}
): void {
  let sent = false
  let postReadyTimer: ReturnType<typeof setTimeout> | null = null
  let postReadyDataDisposable: { dispose: () => void } | null = null

  const cleanup = (): void => {
    sent = true
    if (postReadyTimer !== null) {
      clearTimeout(postReadyTimer)
      postReadyTimer = null
    }
    postReadyDataDisposable?.dispose()
    postReadyDataDisposable = null
  }

  const flush = (): void => {
    if (sent) {
      return
    }
    sent = true
    postReadyDataDisposable?.dispose()
    postReadyDataDisposable = null
    if (postReadyTimer !== null) {
      clearTimeout(postReadyTimer)
      postReadyTimer = null
    }
    const submit = globalThis.process.platform === 'win32' ? '\r' : '\n'
    process.write(
      buildStartupCommandSubmission(startupCommand, {
        submit,
        bracketedPasteSafe: options.bracketedPasteSafe === true
      })
    )
  }

  const schedulePostReadyFlush = (): void => {
    postReadyTimer = setTimeout(flush, POST_SHELL_READY_STARTUP_COMMAND_DELAY_MS)
  }

  readyPromise.then((signal) => {
    if (sent) {
      return
    }
    // Why: the ready marker can precede zle/readline entering raw mode. Wait
    // for post-marker output when available, with a bounded fallback.
    if (signal?.postMarkerBytesObserved === true) {
      schedulePostReadyFlush()
      return
    }
    postReadyDataDisposable = process.onData(() => {
      postReadyDataDisposable?.dispose()
      postReadyDataDisposable = null
      if (postReadyTimer !== null) {
        clearTimeout(postReadyTimer)
      }
      schedulePostReadyFlush()
    })
    postReadyTimer = setTimeout(() => {
      postReadyDataDisposable?.dispose()
      postReadyDataDisposable = null
      postReadyTimer = null
      flush()
    }, POST_SHELL_READY_STARTUP_COMMAND_FALLBACK_MS)
  })
  onExit(cleanup)
}
