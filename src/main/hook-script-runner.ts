import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { getRuntimePathBasename } from '../shared/cross-platform-path'
import { shouldWaitForSetupBeforeAgentStartup } from '../shared/setup-agent-startup-policy'
import { TERMINAL_GIT_CREDENTIAL_GUARD_POLICY_ENV } from '../shared/terminal-git-credential-guard'
import type { Repo, WorktreeSetupLaunch } from '../shared/types'
import type { ProjectExecutionRuntimeResolution } from '../shared/project-execution-runtime'
import { gitExecFileSync } from './git/runner'
import { isWslPath, parseWslPath, toLinuxPath, toWindowsWslPath } from './wsl'

export type HookRuntimeTarget = { wslDistro?: string | null }

export function getSetupEnvVars(repo: Repo, worktreePath: string): Record<string, string> {
  return {
    YIRU_ROOT_PATH: repo.path,
    YIRU_WORKTREE_PATH: worktreePath,
    YIRU_WORKSPACE_NAME: getRuntimePathBasename(worktreePath),
    // Compat with conductor.json users
    CONDUCTOR_ROOT_PATH: repo.path,
    GHOSTX_ROOT_PATH: repo.path
  }
}

function getGitPath(cwd: string, relativePath: string, runtimeTarget?: HookRuntimeTarget): string {
  return gitExecFileSync(['rev-parse', '--git-path', relativePath], {
    cwd,
    ...(runtimeTarget?.wslDistro ? { wslDistro: runtimeTarget.wslDistro } : {})
  }).trim()
}

export function getHookRuntimeTarget(
  projectRuntime?: ProjectExecutionRuntimeResolution | HookRuntimeTarget
): HookRuntimeTarget | undefined {
  if (!projectRuntime) {
    return undefined
  }

  if ('status' in projectRuntime) {
    if (projectRuntime.status === 'repair-required') {
      return projectRuntime.repair.preferredRuntime.kind === 'wsl'
        ? { wslDistro: projectRuntime.repair.preferredRuntime.distro }
        : undefined
    }
    return projectRuntime.runtime.kind === 'wsl'
      ? { wslDistro: projectRuntime.runtime.distro }
      : undefined
  }

  return projectRuntime.wslDistro ? { wslDistro: projectRuntime.wslDistro } : undefined
}

export function getHookWslContext(
  cwd: string,
  runtimeTarget?: HookRuntimeTarget
): { distro: string | null; linuxPath: string } | null {
  const pathInfo = parseWslPath(cwd)
  if (pathInfo) {
    return pathInfo
  }

  const wslDistro = runtimeTarget?.wslDistro?.trim()
  if (!wslDistro) {
    return null
  }

  // Why: project runtime can route a normal Windows checkout through WSL; hooks
  // must cd to the Linux view of that path rather than running in cmd.exe.
  return {
    distro: wslDistro,
    linuxPath: toLinuxPath(cwd)
  }
}

export function buildWindowsRunnerScript(script: string): string {
  let runnerScript = '@echo off\r\nsetlocal EnableExtensions\r\n'

  for (const rawLine of iterateLfScriptLines(script)) {
    const command = rawLine.trim()
    if (!command) {
      runnerScript += '\r\n'
      continue
    }

    // Why: setup commands often invoke `npm`/`pnpm`, which are batch files on
    // Windows. Calling one batch file from another without `call` never returns
    // to later lines, and plain newline-separated commands also keep running
    // after failures. Wrap each line in `call` and bail on non-zero exit codes
    // so the generated runner matches the fail-fast behavior of `set -e`.
    runnerScript += `call ${command}\r\nif errorlevel 1 exit /b %errorlevel%\r\n`
  }

  return runnerScript
}

function* iterateLfScriptLines(script: string): Generator<string> {
  let lineStart = 0

  for (let index = 0; index < script.length; index++) {
    if (script.charCodeAt(index) !== 10) {
      continue
    }
    const lineEnd = index > lineStart && script.charCodeAt(index - 1) === 13 ? index - 1 : index
    yield script.slice(lineStart, lineEnd)
    lineStart = index + 1
  }

  if (lineStart <= script.length) {
    yield script.slice(lineStart)
  }
}

export function createSetupRunnerScript(
  repo: Repo,
  worktreePath: string,
  script: string,
  projectRuntime?: ProjectExecutionRuntimeResolution | HookRuntimeTarget
): WorktreeSetupLaunch {
  return createWorktreeRunnerScript(
    repo,
    worktreePath,
    script,
    'setup-runner',
    getHookRuntimeTarget(projectRuntime),
    shouldWaitForSetupBeforeAgentStartup(repo.hookSettings?.setupAgentStartupPolicy)
  )
}

export function getSetupRunnerEnvVars(repo: Repo, worktreePath: string): Record<string, string> {
  return {
    ...getSetupEnvVars(repo, worktreePath),
    // Why: the visible Setup terminal is still unattended automation; user
    // terminal opt-out must not let its git commands open credential UI.
    [TERMINAL_GIT_CREDENTIAL_GUARD_POLICY_ENV]: 'guard'
  }
}

export function buildPosixRunnerScript(script: string): string {
  return `#!/usr/bin/env bash\nset -e\n${normalizeCrlfScriptLineEndings(script)}\n`
}

function normalizeCrlfScriptLineEndings(script: string): string {
  let crlfStart = script.indexOf('\r\n')
  if (crlfStart === -1) {
    return script
  }

  let normalized = script.slice(0, crlfStart)
  let chunkStart = crlfStart + 2
  normalized += '\n'
  crlfStart = script.indexOf('\r\n', chunkStart)

  while (crlfStart !== -1) {
    normalized += script.slice(chunkStart, crlfStart)
    normalized += '\n'
    chunkStart = crlfStart + 2
    crlfStart = script.indexOf('\r\n', chunkStart)
  }

  return `${normalized}${script.slice(chunkStart)}`
}

function createWorktreeRunnerScript(
  repo: Repo,
  worktreePath: string,
  script: string,
  runnerBaseName: 'setup-runner',
  runtimeTarget?: HookRuntimeTarget,
  waitForAgentStartup?: boolean
): WorktreeSetupLaunch {
  const envVars = getSetupRunnerEnvVars(repo, worktreePath)
  // Why: WSL worktrees run on a Linux filesystem even though process.platform
  // is 'win32'. Use bash scripts for WSL, .cmd for native Windows.
  const wslWorktree = isWslPath(worktreePath) || Boolean(runtimeTarget?.wslDistro)
  const useWindowsFormat = process.platform === 'win32' && !wslWorktree
  // Why: linked git worktrees use a `.git` file that points at the real gitdir,
  // so writing under `${worktreePath}/.git/...` fails. `git rev-parse --git-path`
  // resolves the actual per-worktree git storage path safely across platforms.
  const gitRelPath = useWindowsFormat ? `yiru/${runnerBaseName}.cmd` : `yiru/${runnerBaseName}.sh`
  let runnerScriptPath = getGitPath(worktreePath, gitRelPath, runtimeTarget)

  // Why: for WSL worktrees, getGitPath returns a Linux path (e.g. /home/user/...)
  // because git runs inside WSL. Convert it to a Windows UNC path so mkdirSync
  // and writeFileSync (which run on Windows) can access it.
  if (wslWorktree) {
    const wslInfo = getHookWslContext(worktreePath, runtimeTarget)
    if (wslInfo?.distro) {
      runnerScriptPath = toWindowsWslPath(runnerScriptPath.trim(), wslInfo.distro)
    }
  }

  mkdirSync(dirname(runnerScriptPath), { recursive: true })

  if (useWindowsFormat) {
    writeFileSync(runnerScriptPath, buildWindowsRunnerScript(script), 'utf-8')
  } else {
    writeFileSync(runnerScriptPath, buildPosixRunnerScript(script), 'utf-8')
    // Why: chmod via UNC paths to WSL filesystem is supported by Windows and
    // sets the execute bit correctly inside WSL.
    chmodSync(runnerScriptPath, 0o755)
  }

  // Why: when the worktree is on WSL, env vars like YIRU_ROOT_PATH and
  // YIRU_WORKTREE_PATH contain Windows UNC paths. The setup script runs
  // inside WSL bash, so translate them to Linux paths.
  if (wslWorktree) {
    for (const key of Object.keys(envVars)) {
      envVars[key] = toLinuxPath(envVars[key])
    }
  }

  return {
    runnerScriptPath,
    envVars,
    ...(waitForAgentStartup === true ? { waitForAgentStartup: true } : {})
  }
}
