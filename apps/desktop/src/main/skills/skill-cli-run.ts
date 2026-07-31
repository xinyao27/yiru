import { spawn, type ChildProcess } from 'node:child_process'

import type {
  SkillUpdateFailure,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '~shared/skill-freshness'

import { killWithDescendantSweep } from '../pty-descendant-termination'
import { resolveCliCommand } from '../runtime/cli-command'
import { getSpawnArgsForWindows } from '../win32-utils'
import {
  buildSkillCliInvocation,
  type SkillCliInvocation,
  type SkillCliRequest
} from './skill-cli-invocation'

// Why: the `skills` CLI prints ANSI colour and \r + erase-line progress. We show
// this log verbatim to the user but never parse it — the manage verbs have no
// --json (that flag exists only on `list`), so stdout is not a contract.
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g // eslint-disable-line no-control-regex

// Keep the tail: failures land at the end, and an unbounded buffer would pin
// however much the CLI decides to print.
const MAX_OUTPUT_CHARS = 32_000

// Long enough to swallow a burst of progress frames, short enough that the log
// still reads as live when the user has it expanded.
const OUTPUT_FLUSH_MS = 100

// Strictly above the sweep's own transitive worst case (~1s on POSIX; 3s identity
// query + 5s taskkill on Windows). A backstop that ties its own bound would fire
// while a slow-but-healthy sweep is still working.
export const CANCEL_RELEASE_TIMEOUT_MS = 12_000

export type SkillCliRunnerDeps = {
  spawnProcess?: typeof spawn
  resolveCommand?: (commandName: string) => string
  /** Names that did not land, re-read from disk; null when this operation and
   *  scope cannot be judged from disk and only the exit code is available. */
  rescanFailedNames?: (invocation: SkillCliInvocation) => Promise<string[] | null>
  killTree?: (pid: number, killRoot: () => void) => Promise<void>
  /** Injected so the Windows cmd.exe rail is reachable off Windows. */
  buildSpawnArgs?: typeof getSpawnArgsForWindows
  now?: () => number
  onState?: (run: SkillUpdateRun) => void
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, '').replace(/\r(?!\n)/g, '\n')
}

function clampOutput(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS ? value : value.slice(value.length - MAX_OUTPUT_CHARS)
}

/**
 * Runs `npx --yes skills <update|add|remove> … -y` headlessly.
 *
 * Both `--yes` flags are load-bearing and distinct: `npx --yes` skips the
 * install-this-package prompt, and `skills … -y` takes the CLI's own
 * non-interactive branch. `skills` gates its prompts on
 * `options.yes || !process.stdin.isTTY`, and stdin is ignored below, so the run
 * cannot block on input that no one can answer.
 */
export class SkillCliRunner {
  private run: SkillUpdateRun = { state: 'idle' }
  private child: ChildProcess | null = null
  // Why: a failed spawn emits `error` *and* `close`, and a cancelled child still
  // emits `close` after `kill()`. The token retires a child's handlers so a dead
  // run can never settle or write output into the run that replaced it; the latch
  // keeps the first verdict of a live run while its re-scan is still in flight.
  private runToken = 0
  private settling = false
  private killing = false
  private readonly deps: Required<Pick<SkillCliRunnerDeps, 'now'>> & SkillCliRunnerDeps

  constructor(deps: SkillCliRunnerDeps = {}) {
    this.deps = { now: () => Date.now(), ...deps }
  }

  getState(): SkillUpdateRun {
    return this.run
  }

  private publish(next: SkillUpdateRun): void {
    this.run = next
    this.deps.onState?.(next)
  }

  start(request: SkillCliRequest): SkillUpdateStartResult {
    if (this.run.state === 'running') {
      return { started: false, reason: 'already-running' }
    }
    const built = buildSkillCliInvocation(request)
    if (!built.ok) {
      return { started: false, reason: built.reason }
    }
    const invocation = built.invocation
    const subject = {
      operation: invocation.operation,
      names: invocation.names,
      ...(invocation.source ? { source: invocation.source } : {})
    }

    const resolveCommand = this.deps.resolveCommand ?? ((name: string) => resolveCliCommand(name))
    const spawnProcess = this.deps.spawnProcess ?? spawn
    const npxCommand = resolveCommand('npx')

    let spawnCmd: string
    let spawnArgs: string[]
    try {
      const buildSpawnArgs = this.deps.buildSpawnArgs ?? getSpawnArgsForWindows
      ;({ spawnCmd, spawnArgs } = buildSpawnArgs(npxCommand, invocation.args))
    } catch {
      // Why: the arguments are already canonical here, so this is the cmd.exe rail
      // rejecting the resolved npx *path* — a profile directory containing `&`,
      // `%` or `!` is enough. Publishing the failure keeps the dialog honest;
      // returning a bare `started: false` would leave the button dead and silent.
      this.runToken += 1
      this.settling = false
      this.publish({
        state: 'error',
        kind: 'unsafe-command-path',
        command: npxCommand,
        ...subject,
        finishedAt: this.deps.now(),
        output: '',
        failedNames: invocation.names
      })
      return { started: false, reason: 'unsafe-command-path' }
    }

    const startedAt = this.deps.now()
    const token = ++this.runToken
    this.settling = false
    this.publish({ state: 'running', ...subject, startedAt, output: '' })

    const child = spawnProcess(spawnCmd, spawnArgs, {
      // Why: stdin ignored keeps `process.stdin.isTTY` falsy in the child, which
      // is the second half of the CLI's non-interactive gate.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
      // Why: a project-scoped install/remove is expressed purely as the absence
      // of `-g` plus the checkout the CLI runs in.
      ...(invocation.scope.kind === 'project' ? { cwd: invocation.scope.repoPath } : {})
    })
    this.child = child

    // Why: `stripAnsi` turns each \r progress frame into its own line, so an npm
    // install emits many chunks a second — and every publish structured-clones
    // the whole buffer to every window. Coalesce into one push per tick.
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let pendingOutput = ''
    const flush = (): void => {
      flushTimer = null
      if (token !== this.runToken || this.run.state !== 'running' || !pendingOutput) {
        return
      }
      const appended = pendingOutput
      pendingOutput = ''
      this.publish({ ...this.run, output: clampOutput(this.run.output + appended) })
    }
    const append = (chunk: Buffer): void => {
      if (token !== this.runToken || this.run.state !== 'running') {
        return
      }
      pendingOutput = clampOutput(pendingOutput + stripAnsi(chunk.toString('utf8')))
      if (!flushTimer) {
        flushTimer = setTimeout(flush, OUTPUT_FLUSH_MS)
        flushTimer.unref?.()
      }
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    // The tail matters most on failure, so never let a pending chunk die with the
    // process — drain it before the exit handlers settle the run.
    const drain = (): void => {
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      flush()
    }

    child.on('error', (error) => {
      drain()
      this.settle(token, invocation, { kind: 'launch-failed', detail: error.message })
    })
    child.on('close', (code) => {
      drain()
      this.settle(token, invocation, code === 0 ? null : { kind: 'command-exited', exitCode: code })
    })

    return { started: true }
  }

  private settle(
    token: number,
    invocation: SkillCliInvocation,
    commandFailure: Exclude<
      SkillUpdateFailure,
      { kind: 'unsafe-command-path' | 'incomplete' }
    > | null
  ): void {
    if (token !== this.runToken || this.settling || this.run.state !== 'running') {
      return
    }
    this.settling = true
    this.child = null
    const output = this.run.output
    const finishedAt = this.deps.now()
    const rescan = this.deps.rescanFailedNames
    const names = invocation.names
    const subject = {
      operation: invocation.operation,
      names,
      ...(invocation.source ? { source: invocation.source } : {})
    }

    // Why: when the re-scan produces a verdict it *is* the answer — it re-reads
    // what landed on disk, which is what the user actually cares about. The exit
    // code only decides the outcome when no verdict is available, because the
    // `skills` CLI reports nothing else we can trust.
    const finish = (failedNames: string[] | null): void => {
      // The re-scan is slow enough that a cancel — or a whole replacement run —
      // can land while it is still in flight; its verdict is about a run that no
      // longer exists.
      if (token !== this.runToken) {
        return
      }
      const failed = failedNames ?? (commandFailure ? names : [])
      // An install of a whole source has no names to converge, so a bad exit code
      // is the only evidence there is; it must not read as an empty success.
      const unjudged = failedNames === null && commandFailure !== null
      if (!unjudged && failed.length === 0) {
        this.publish({ state: 'success', ...subject, finishedAt, output })
        return
      }
      this.publish({
        state: 'error',
        ...(commandFailure ?? { kind: 'incomplete' }),
        ...subject,
        finishedAt,
        output,
        failedNames: failed
      })
    }

    if (!rescan) {
      finish(null)
      return
    }
    void rescan(invocation).then(
      (failedNames) => finish(failedNames),
      () => finish(null)
    )
  }

  cancel(): void {
    if (this.killing) {
      return
    }
    // Retire the child's handlers now so its exit settles nothing.
    this.runToken += 1
    this.settling = false
    const child = this.child
    this.child = null
    if (!child) {
      if (this.run.state === 'running') {
        this.publish({ state: 'idle' })
      }
      return
    }

    // Why: `npx` is a wrapper — on POSIX the `skills` process it execs is a
    // child, and on Windows the shim runs under cmd.exe. Killing only the direct
    // child leaves the process that is actually writing to the skill homes alive.
    this.killing = true
    let hasReleased = false
    let releaseTimer: ReturnType<typeof setTimeout> | null = null
    const release = (): void => {
      if (hasReleased) {
        return
      }
      hasReleased = true
      if (releaseTimer) {
        clearTimeout(releaseTimer)
      }
      this.killing = false
      // Why: stay `running` until the tree is actually dead. The sweep waits for
      // a descendant snapshot before it signals anything, so releasing on the
      // synchronous path would let an immediate re-run spawn a second npx
      // writing the same bundles — the corruption the post-run verdict exists to
      // catch. `start()` already refuses while running, so holding the state is
      // the whole guard.
      if (this.run.state === 'running') {
        this.publish({ state: 'idle' })
      }
    }
    // Every layer of the sweep is individually bounded, but this is the recovery
    // path: if one ever fails to settle, the run would be stuck `running` with
    // Stop already spent. Cap it rather than depend on that transitively.
    releaseTimer = setTimeout(release, CANCEL_RELEASE_TIMEOUT_MS)
    releaseTimer.unref?.()
    if (this.run.state === 'running') {
      this.publish({ ...this.run, stopping: true })
    }

    const kill = this.deps.killTree ?? killWithDescendantSweep
    const pid = child.pid
    if (typeof pid !== 'number') {
      // Same contract as the sweep path below: a throwing kill must not escape
      // and leave `killing` latched with the run stuck `running`.
      try {
        child.kill()
      } catch {
        /* already gone, or not ours to signal */
      }
      release()
      return
    }
    // Why `release` on both paths and no retry: the sweep runs `killRoot()` in its
    // own `finally`, so the only way it rejects is that kill throwing (EPERM) —
    // calling it again would throw straight back out of the rejection handler,
    // leaving an unhandled rejection and no release at all.
    void kill(pid, () => child.kill()).then(release, release)
  }

  /** Clears a settled run so the status-bar segment can retire itself. */
  acknowledge(): void {
    if (this.run.state === 'success' || this.run.state === 'error') {
      this.publish({ state: 'idle' })
    }
  }
}
