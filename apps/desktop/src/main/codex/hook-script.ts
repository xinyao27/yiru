import {
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue
} from '../agent-hooks/hook-stdin-contract'
import { buildWindowsAgentHookCurlPostCommand } from '../agent-hooks/managed-hook-commands'
import {
  CODEX_EVENTS,
  CODEX_EVENT_LABEL,
  getManagedCommand,
  getManagedScriptPath,
  type CodexManagedHookInstallMaterial
} from './hook-foundation'

export function getManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      // Why: see claude/hook-service.ts for rationale. The endpoint file holds
      // the live port/token for this Yiru install; sourcing it here lets a
      // surviving PTY reach the current runtime host even though its env points at
      // the prior Yiru's coordinates.
      'if defined YIRU_AGENT_HOOK_ENDPOINT if exist "%YIRU_AGENT_HOOK_ENDPOINT%" call "%YIRU_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookCurlPostCommand('codex'),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    ...buildPosixHookPayloadCapture(),
    // Why: see claude/hook-service.ts for rationale. Sourcing refreshes
    // PORT/TOKEN/ENV/VERSION from the current Yiru so a surviving PTY keeps
    // reporting after a restart.
    'load_hook_endpoint() {',
    '  endpoint_path="$1"',
    '  case "$endpoint_path" in',
    '    *.cmd)',
    // Why: Windows passes endpoint.cmd into WSL through WSLENV path translation.
    // Parse only Yiru's known assignments; cmd.exe `set` lines are not shell syntax.
    '      endpoint_cr=$(printf "\\r")',
    '      while IFS= read -r endpoint_line || [ -n "$endpoint_line" ]; do',
    '        endpoint_line=${endpoint_line%"$endpoint_cr"}',
    '        case "$endpoint_line" in',
    '          "set YIRU_AGENT_HOOK_PORT="*) YIRU_AGENT_HOOK_PORT=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_TOKEN="*) YIRU_AGENT_HOOK_TOKEN=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_ENV="*) YIRU_AGENT_HOOK_ENV=${endpoint_line#*=} ;;',
    '          "set YIRU_AGENT_HOOK_VERSION="*) YIRU_AGENT_HOOK_VERSION=${endpoint_line#*=} ;;',
    '        esac',
    '      done < "$endpoint_path"',
    '      ;;',
    '    *)',
    '      . "$endpoint_path" 2>/dev/null || :',
    '      ;;',
    '  esac',
    '}',
    'if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then',
    '  load_hook_endpoint "$YIRU_AGENT_HOOK_ENDPOINT"',
    'fi',
    'if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then',
    '  exit 0',
    'fi',
    'post_codex_hook() {',
    '  curl_bin="$1"',
    '  connect_timeout="${2:-0.5}"',
    '  max_time="${3:-1.5}"',
    // Why: worktreeId embeds a filesystem path, so hand-building JSON in POSIX
    // shell is not safe once a path contains quotes or newlines. Post the raw
    // hook payload plus metadata as form fields and let the receiver parse it.
    // Timeout caps best-effort hook posts if the local listener stalls.
    // Why: pipe payload to curl's stdin (`payload@-`) instead of an inline
    // `payload=$VALUE` arg, so tens-of-KB tool output stays off the curl
    // command line (EDR command-line false positives). Wire body is identical.
    '  printf \'%s\' "$payload" | "$curl_bin" -sS -X POST "http://127.0.0.1:${YIRU_AGENT_HOOK_PORT}/hook/codex" \\',
    '    --connect-timeout "$connect_timeout" --max-time "$max_time" \\',
    '    --noproxy "127.0.0.1" \\',
    '    -H "Content-Type: application/x-www-form-urlencoded" \\',
    '    -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \\',
    '    --data-urlencode "paneKey=${YIRU_PANE_KEY}" \\',
    '    --data-urlencode "tabId=${YIRU_TAB_ID}" \\',
    '    --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \\',
    '    --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \\',
    '    --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \\',
    '    --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \\',
    '    --data-urlencode "payload@-"',
    '}',
    'is_wsl_runtime() {',
    '  [ -n "$WSL_DISTRO_NAME" ] && return 0',
    '  grep -qiE "microsoft|wsl" /proc/sys/kernel/osrelease /proc/version 2>/dev/null',
    '}',
    'if post_codex_hook curl >/dev/null 2>&1; then',
    '  exit 0',
    'fi',
    'if is_wsl_runtime; then',
    '  windows_curl=$(command -v curl.exe 2>/dev/null || true)',
    '  if [ -n "$windows_curl" ] && [ -x "$windows_curl" ]; then',
    '    post_codex_hook "$windows_curl" 3 5 >/dev/null 2>&1 || true',
    '  fi',
    'fi',
    'exit 0',
    ''
  ].join('\n')
}

// Why: the real-home installer must byte-match the managed lane's events,
// command, and script, or trust signatures diverge between the two homes.
export function getCodexManagedHookInstallMaterial(): CodexManagedHookInstallMaterial {
  const scriptPath = getManagedScriptPath()
  return {
    events: CODEX_EVENTS,
    eventLabel: CODEX_EVENT_LABEL,
    scriptPath,
    command: getManagedCommand(scriptPath),
    script: getManagedScript()
  }
}
