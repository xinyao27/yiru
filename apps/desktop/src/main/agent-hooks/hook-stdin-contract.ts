export type PosixHookEmptyPayloadPolicy = 'exit' | 'empty-object'

export const POSIX_HOOK_STDIN_DRAIN_COMMAND = 'cat >/dev/null 2>&1 || :'

// Why: every POSIX hook must own stdin before any no-op exit; sharing this
// prelude prevents agent templates from inventing different drain semantics.
export function buildPosixHookPayloadCapture(
  emptyPayloadPolicy: PosixHookEmptyPayloadPolicy = 'exit'
): string[] {
  const emptyPayloadLines =
    emptyPayloadPolicy === 'empty-object' ? ["  payload='{}'"] : ['  exit 0']
  return ['payload=$(cat)', 'if [ -z "$payload" ]; then', ...emptyPayloadLines, 'fi']
}

// Why: mirrors buildWindowsHookEnvironmentGuardLines. Sourcing the endpoint
// file refreshes PORT/TOKEN/ENV/VERSION for a PTY that survived a Yiru restart
// (see claude/hook-service.ts for the staleness rationale); the `|| :` and
// redirected stderr on the `.` builtin swallow a TOCTOU unlink race or a
// malformed line rather than leaking a shell parse error into the agent
// transcript — the guard below already fails open on empty PORT/TOKEN/PANE_KEY.
export function buildPosixHookEnvironmentGuardLines(): string[] {
  return [
    'if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$YIRU_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then',
    '  exit 0',
    'fi'
  ]
}

export const WINDOWS_HOOK_STDIN_DRAIN_LABEL = 'yiru_agent_hook_drain_stdin'
export const WINDOWS_HOOK_STDIN_DRAIN_COMMAND = '"%SystemRoot%\\System32\\more.com" >nul 2>nul'

// Why: batch payloads stream directly to curl and cannot be buffered safely in
// environment variables, so guard failures share one EOF-draining epilogue.
export function buildWindowsHookEnvironmentGuardLines(): string[] {
  const drainTarget = `goto :${WINDOWS_HOOK_STDIN_DRAIN_LABEL}`
  return [
    `if "%YIRU_AGENT_HOOK_PORT%"=="" ${drainTarget}`,
    `if "%YIRU_AGENT_HOOK_TOKEN%"=="" ${drainTarget}`,
    `if "%YIRU_PANE_KEY%"=="" ${drainTarget}`
  ]
}

export function buildWindowsHookStdinDrainEpilogue(): string[] {
  return [
    `:${WINDOWS_HOOK_STDIN_DRAIN_LABEL}`,
    // Why: qualify the inbox reader because Windows searches the worktree for
    // executables before PATH and hook payloads must not reach repo-local code.
    WINDOWS_HOOK_STDIN_DRAIN_COMMAND,
    'exit /b 0'
  ]
}
