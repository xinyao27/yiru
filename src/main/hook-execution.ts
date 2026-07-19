import { exec, execFile } from 'node:child_process'
import type { Repo } from '../shared/types'
import type { ProjectExecutionRuntimeResolution } from '../shared/project-execution-runtime'
import { promptGuardShellEnv } from './git/runner'
import { toLinuxPath } from './wsl'
import { getEffectiveHooks } from './hook-config'
import {
  getHookRuntimeTarget,
  getHookWslContext,
  getSetupEnvVars,
  type HookRuntimeTarget
} from './hook-script-runner'

const HOOK_TIMEOUT = 120_000

function getHookShell(): string | undefined {
  return process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/bash'
}

/**
 * Run a named hook script in the given working directory.
 */
export function runHook(
  hookName: 'setup' | 'archive',
  cwd: string,
  repo: Repo,
  hooksPath?: string,
  projectRuntime?: ProjectExecutionRuntimeResolution | HookRuntimeTarget
): Promise<{ success: boolean; output: string }> {
  const hooks = getEffectiveHooks(repo, hooksPath)
  const script = hooks?.scripts[hookName]

  if (!script) {
    return Promise.resolve({ success: true, output: '' })
  }

  const runtimeTarget = getHookRuntimeTarget(projectRuntime)
  const wslInfo = getHookWslContext(cwd, runtimeTarget)

  if (wslInfo) {
    // Why: use execFile('wsl.exe', [...]) instead of exec() to bypass the
    // Windows shell (cmd.exe). exec() always routes through a shell, and
    // cmd.exe doesn't understand single-quote escaping — it would mangle
    // paths/scripts containing %, ^, &, |, etc.
    const escapedCwd = wslInfo.linuxPath.replace(/'/g, "'\\''")
    const escapedScript = script.replace(/'/g, "'\\''")
    const bashCmd = `cd '${escapedCwd}' && ${escapedScript}`
    // Why: translate YIRU_ROOT_PATH / YIRU_WORKTREE_PATH to Linux paths so
    // hook scripts that reference $YIRU_WORKTREE_PATH get usable paths
    // inside WSL, not Windows UNC paths.
    const envVars = getSetupEnvVars(repo, cwd)
    const wslEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(envVars)) {
      wslEnv[key] = toLinuxPath(value)
    }

    return new Promise((resolve) => {
      let child: ReturnType<typeof execFile> | null = null
      let settled = false

      const finish = (error: Error | null, stdout = '', stderr = ''): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        if (error) {
          console.error(`[hooks] ${hookName} hook failed in ${cwd}:`, error.message)
          resolve({
            success: false,
            output: `${stdout}\n${stderr}\n${error.message}`.trim()
          })
        } else {
          console.log(`[hooks] ${hookName} hook completed in ${cwd}`)
          resolve({
            success: true,
            output: `${stdout}\n${stderr}`.trim()
          })
        }
      }

      // Why: Node's execFile timeout only signals wsl.exe; if no callback
      // arrives, hook setup/archive must still unblock after HOOK_TIMEOUT.
      const timeout = setTimeout(() => {
        child?.kill()
        finish(new Error(`Hook timed out after ${HOOK_TIMEOUT}ms.`))
      }, HOOK_TIMEOUT)

      try {
        const distroArgs = wslInfo.distro ? ['-d', wslInfo.distro] : []
        child = execFile(
          'wsl.exe',
          [...distroArgs, '--', 'bash', '-c', bashCmd],
          {
            timeout: HOOK_TIMEOUT,
            encoding: 'utf-8',
            // Why: same unattended-git guard as the non-WSL branch below
            // (issue #7652) — WSL repos are the likeliest to hit the GCM
            // popup, and the guard's WSLENV registration is what carries it
            // across the wsl.exe boundary into the distro.
            env: promptGuardShellEnv({ ...process.env, ...wslEnv })
          },
          (error, stdout, stderr) => {
            finish(error ?? null, stdout, stderr)
          }
        )
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return new Promise((resolve) => {
    exec(
      script,
      {
        cwd,
        timeout: HOOK_TIMEOUT,
        shell: getHookShell(),
        // Why: setup/archive hooks run unattended, so a `git fetch`/`submodule
        // update` inside one must never make Git Credential Manager pop its
        // "Connect to GitHub" OAuth window on Windows and loop when the network
        // can't complete it (issue #7652). The guard keeps the credential
        // helper, so cached auth still works; only the interactive prompt dies.
        env: promptGuardShellEnv({
          ...process.env,
          ...getSetupEnvVars(repo, cwd)
        })
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`[hooks] ${hookName} hook failed in ${cwd}:`, error.message)
          resolve({
            success: false,
            output: `${stdout}\n${stderr}\n${error.message}`.trim()
          })
        } else {
          console.log(`[hooks] ${hookName} hook completed in ${cwd}`)
          resolve({
            success: true,
            output: `${stdout}\n${stderr}`.trim()
          })
        }
      }
    )
  })
}
