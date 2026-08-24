import { execFile, type ChildProcess } from 'node:child_process'

import {
  classifyErrorCode,
  isTabClosedTransportError,
  pageUnavailableMessageForSession,
  resolveAgentBrowserBinary
} from './agent-browser-bridge-command'
import {
  CONSECUTIVE_TIMEOUT_LIMIT,
  EXEC_TIMEOUT_MS,
  PAGE_REPLACEMENT_POLL_MS,
  PAGE_REPLACEMENT_WAIT_TIMEOUT_MS,
  STALE_SESSION_CLOSE_TIMEOUT_MS,
  type AgentBrowserBridgeOptions,
  type AgentBrowserExecOptions,
  type QueuedCommand,
  type SessionState,
  focusedRichTextEditExpression,
  isExplicitContentEditableResult
} from './agent-browser-bridge-input'
import { translateResult } from './agent-browser-bridge-result'
import { BrowserError } from './cdp-bridge'
import type { BrowserPageProvider } from './page/catalog'
import type { BrowserPageHandle } from './page/handle'

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before

export abstract class AgentBrowserBridgeFoundation {
  // Why: per-worktree active tab prevents one worktree's tab switch from
  // affecting another worktree's command targeting.
  protected readonly activePagePerWorktree = new Map<string, string>()
  protected activePageId: string | null = null
  protected readonly sessions = new Map<string, SessionState>()
  protected readonly commandQueues = new Map<string, QueuedCommand[]>()
  protected readonly processingQueues = new Set<string>()
  // Why: screenshot prep temporarily changes shared renderer paintability state.
  // Per-session queues only serialize commands within one browser tab, so
  // concurrent screenshots on different tabs can otherwise interleave hidden
  // surface leases and blank each other's capture.
  protected screenshotTurn: Promise<void> = Promise.resolve()
  protected readonly agentBrowserBin: string
  // Why: when a process swap destroys a session that had active intercept patterns,
  // store them here keyed by sessionName so the next ensureSession + first successful
  // command can restore them automatically.
  protected readonly pendingInterceptRestore = new Map<string, string[]>()
  // Why: two concurrent CLI calls can both enter ensureSession before either creates
  // the session entry. This promise-based lock ensures only one creation proceeds.
  protected readonly pendingSessionCreation = new Map<string, Promise<void>>()
  // Why: session destruction shells out to `agent-browser close`, which is async
  // and keyed by session name. Recreating the same session before that close
  // finishes can let the old teardown close the new daemon session.
  protected readonly pendingSessionDestruction = new Map<string, Promise<void>>()
  protected readonly cancelledProcesses = new WeakSet<ChildProcess>()
  protected readonly browserPages: BrowserPageProvider
  protected readonly options: AgentBrowserBridgeOptions

  constructor(browserPages: BrowserPageProvider, options: AgentBrowserBridgeOptions = {}) {
    this.browserPages = browserPages
    this.options = options
    this.agentBrowserBin = resolveAgentBrowserBinary()
  }

  // ── Tab tracking ──

  protected rejectQueuedCommandsForClosedSession(sessionName: string): void {
    const queue = this.commandQueues.get(sessionName)
    this.commandQueues.delete(sessionName)
    this.processingQueues.delete(sessionName)
    if (queue) {
      const err = new BrowserError(
        'browser_tab_closed',
        'Tab was closed while commands were queued'
      )
      for (const cmd of queue) {
        cmd.reject(err)
      }
      queue.length = 0
    }
  }

  protected async execAgentBrowser(
    sessionName: string,
    commandArgs: string[],
    execOptions?: AgentBrowserExecOptions
  ): Promise<unknown> {
    const session = this.sessions.get(sessionName)
    if (!session) {
      // Why: queued commands can reach execution after a concurrent tab close
      // deletes the session. Surface this as a tab lifecycle error, not an
      // opaque internal bridge failure.
      throw this.createPageUnavailableError(sessionName)
    }

    // Why: between enqueue time and execution time, the backend page may close or
    // be replaced. Check the opaque instance identity before driving its proxy.
    if (
      this.browserPages.getPage(session.browserPageId)?.identity.backendPageId !==
      session.backendPageId
    ) {
      await this.destroySession(sessionName)
      throw this.createPageUnavailableError(sessionName)
    }

    const args = ['--session', sessionName]
    const managesInterceptRoutes =
      commandArgs[0] === 'network' && (commandArgs[1] === 'route' || commandArgs[1] === 'unroute')

    // Why: --cdp is session-initialization only — first command needs it, subsequent don't.
    // Pass the explicit IPv4 websocket endpoint. agent-browser resolves a numeric
    // port through localhost, which may prefer ::1 while this protected proxy is
    // deliberately bound to 127.0.0.1; that miss silently launches a new Chrome.
    // The proxy itself exposes only this page, so direct CDP cannot select the host renderer.
    const needsInit = !session.initialized
    if (needsInit) {
      args.push('--cdp', session.cdpEndpoint)
    }

    // Why: exec passthrough can produce a large argv array; spreading it into
    // push risks V8 argument limits before execFile receives the command.
    for (const commandArg of commandArgs) {
      args.push(commandArg)
    }
    args.push('--json')

    const stdout = await this.runAgentBrowserRaw(sessionName, args, execOptions)
    const translated = translateResult(stdout)

    if (!translated.ok) {
      throw this.createCommandError(
        sessionName,
        translated.error.message,
        translated.error.code,
        session.backendPageId
      )
    }

    // Why: only mark initialized after a successful command — if the first --cdp
    // connection fails, the next attempt should retry with --cdp.
    if (needsInit) {
      session.initialized = true

      // Why: after a process swap, intercept patterns are lost because the session
      // was destroyed and recreated. Restore them now that the new session is live,
      // unless the caller's first command explicitly reconfigured routing.
      const pendingPatterns = managesInterceptRoutes
        ? undefined
        : this.pendingInterceptRestore.get(sessionName)
      if (pendingPatterns && pendingPatterns.length > 0) {
        this.pendingInterceptRestore.delete(sessionName)
        try {
          const urlPattern = pendingPatterns[0] ?? '**/*'
          await this.runAgentBrowserRaw(sessionName, [
            '--session',
            sessionName,
            'network',
            'route',
            urlPattern,
            '--json'
          ])
          session.activeInterceptPatterns = pendingPatterns
        } catch {
          // Why: intercept restore is best-effort — don't fail the user's command
          // if the new page doesn't support the same interception setup.
        }
      }
    }

    return translated.result
  }

  protected async isExplicitContentEditableTarget(
    sessionName: string,
    element: string
  ): Promise<boolean> {
    const result = await this.execAgentBrowser(sessionName, [
      'get',
      'attr',
      element,
      'contenteditable'
    ])
    return isExplicitContentEditableResult(result)
  }

  protected async fillExplicitContentEditable(
    sessionName: string,
    element: string,
    value: string
  ): Promise<void> {
    await this.execAgentBrowser(sessionName, ['focus', element])
    // Why: stdin avoids argv limits while keeping replacement atomic; chunked
    // editor transactions can move focus and split one fill across controls.
    await this.execAgentBrowser(sessionName, ['eval', '--stdin'], {
      stdinText: focusedRichTextEditExpression(JSON.stringify(value), { selectAll: true })
    })
  }

  protected createPageUnavailableError(sessionName: string): BrowserError {
    return new BrowserError('browser_tab_not_found', pageUnavailableMessageForSession(sessionName))
  }

  protected closeStaleAgentBrowserSession(sessionName: string): Promise<void> {
    return new Promise((resolve) => {
      let child: ReturnType<typeof execFile> | null = null
      let settled = false

      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        resolve()
      }

      // Why: this is best-effort daemon cleanup before creating a fresh session;
      // a wedged close command must not block the real browser action.
      const timeout = setTimeout(() => {
        child?.kill()
        finish()
      }, STALE_SESSION_CLOSE_TIMEOUT_MS)

      try {
        child = execFile(
          this.agentBrowserBin,
          ['--session', sessionName, 'close'],
          { timeout: STALE_SESSION_CLOSE_TIMEOUT_MS },
          finish
        )
      } catch {
        finish()
      }
    })
  }

  protected createCommandError(
    sessionName: string,
    message: string,
    fallbackCode: string,
    backendPageId?: string
  ): BrowserError {
    // Why: CDP "connection refused" can also mean a real proxy failure. Only
    // convert it to a closed-page error when bridge state confirms the target is gone.
    if (
      fallbackCode === 'browser_error' &&
      isTabClosedTransportError(message) &&
      this.isSessionTargetClosed(sessionName, backendPageId)
    ) {
      return this.createPageUnavailableError(sessionName)
    }
    return new BrowserError(fallbackCode, message)
  }

  protected isSessionTargetClosed(sessionName: string, backendPageId?: string): boolean {
    const session = this.sessions.get(sessionName)
    if (!session) {
      return true
    }
    const expectedBackendPageId = backendPageId ?? session.backendPageId
    return (
      this.browserPages.getPage(session.browserPageId)?.identity.backendPageId !==
      expectedBackendPageId
    )
  }

  protected runAgentBrowserRaw(
    sessionName: string,
    args: string[],
    execOptions?: AgentBrowserExecOptions
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const session = this.sessions.get(sessionName)
      let child: ChildProcess | null = null
      child = execFile(
        this.agentBrowserBin,
        args,
        // Why: screenshots return large base64 strings that exceed Node's default
        // 1MB maxBuffer, causing ENOBUFS and a timeout-like failure.
        {
          timeout: execOptions?.timeoutMs ?? EXEC_TIMEOUT_MS,
          maxBuffer: 50 * 1024 * 1024,
          env: execOptions?.envOverrides
            ? { ...process.env, ...execOptions.envOverrides }
            : process.env
        },
        (error, stdout, stderr) => {
          if (session && session.activeProcess === child) {
            session.activeProcess = null
          }
          if (child && this.cancelledProcesses.has(child)) {
            this.cancelledProcesses.delete(child)
            reject(
              new BrowserError('browser_tab_closed', 'Tab was closed while command was running')
            )
            return
          }

          const liveSession = this.sessions.get(sessionName)

          if (error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed) {
            if (execOptions?.timeoutError) {
              reject(execOptions.timeoutError)
              return
            }
            if (liveSession) {
              liveSession.consecutiveTimeouts++
              if (liveSession.consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_LIMIT) {
                // Why: 3 consecutive timeouts means the daemon is likely stuck — destroy and recreate
                this.destroySession(sessionName)
              }
            }
            reject(new BrowserError('browser_error', 'Browser command timed out'))
            return
          }

          if (liveSession) {
            liveSession.consecutiveTimeouts = 0
          }

          if (error) {
            // Why: agent-browser exits non-zero for command failures (e.g. clipboard
            // NotAllowedError) but still writes structured JSON to stdout. Parse it
            // so callers get the real error message instead of generic "Command failed".
            if (stdout) {
              try {
                const parsed = JSON.parse(stdout)
                if (parsed.error) {
                  const code = classifyErrorCode(parsed.error)
                  reject(
                    this.createCommandError(sessionName, parsed.error, code, session?.backendPageId)
                  )
                  return
                }
              } catch {
                // stdout not valid JSON — fall through to stderr/error.message
              }
            }
            const message = stderr || error.message
            const code = classifyErrorCode(message)
            reject(this.createCommandError(sessionName, message, code, session?.backendPageId))
            return
          }

          resolve(stdout)
        }
      )
      if (session) {
        session.activeProcess = child
      }
      if (execOptions?.stdinText !== undefined && child?.stdin) {
        // Why: eval --stdin keeps paste-sized scripts out of argv on every platform.
        child.stdin.on('error', () => {})
        child.stdin.end(execOptions.stdinText)
      }
    })
  }

  protected async waitForReplacementPage(
    browserPageId: string,
    previousPage: BrowserPageHandle
  ): Promise<BrowserPageHandle | null> {
    const deadline = Date.now() + PAGE_REPLACEMENT_WAIT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const page = this.browserPages.getPage(browserPageId)
      if (page && page !== previousPage) {
        return page
      }
      await new Promise<void>((resolve) => setTimeout(resolve, PAGE_REPLACEMENT_POLL_MS))
    }
    return null
  }

  protected abstract destroySession(sessionName: string): Promise<void>
  protected abstract selectFallbackActivePage(
    worktreeId: string,
    excludedBrowserPageId?: string
  ): string | null
  abstract getRegisteredTabs(worktreeId?: string): Map<string, string>
}
