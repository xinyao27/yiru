import {
  buildPosixHookEnvironmentGuardLines,
  buildPosixHookPayloadCapture,
  buildWindowsHookEnvironmentGuardLines,
  buildWindowsHookStdinDrainEpilogue,
  WINDOWS_HOOK_STDIN_DRAIN_COMMAND
} from '../agent-hooks/hook-stdin-contract'
import { buildPosixAgentHookCurlPostCommand } from '../agent-hooks/managed-hook-commands'

export function getAntigravityManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      'if /I "%YIRU_ANTIGRAVITY_EVENT%"=="Stop" (',
      '  echo {"decision":""}',
      ') else (',
      '  echo {}',
      ')',
      'if defined YIRU_AGENT_HOOK_ENDPOINT if exist "%YIRU_AGENT_HOOK_ENDPOINT%" call "%YIRU_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAntigravityHookPostCommand(),
      'exit /b 0',
      ...buildWindowsHookStdinDrainEpilogue(),
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    'case "$YIRU_ANTIGRAVITY_EVENT" in',
    '  Stop)',
    '    printf \'{"decision":""}\\n\'',
    '    ;;',
    '  *)',
    // Why: an empty JSON object keeps observational hooks from changing permissions.
    '    printf "{}\\n"',
    '    ;;',
    'esac',
    // Why: some events have no stdin but still need a status post.
    ...buildPosixHookPayloadCapture('empty-object'),
    ...buildPosixHookEnvironmentGuardLines(),
    buildPosixAgentHookCurlPostCommand('antigravity', {
      fieldsAfterVersion: [{ key: 'hook_event_name', value: '${YIRU_ANTIGRAVITY_EVENT}' }]
    }),
    'exit 0',
    ''
  ].join('\n')
}

export function getAntigravityWindowsWrapperScript(eventName: string): string {
  return [
    '@echo off',
    'setlocal',
    `set "YIRU_ANTIGRAVITY_EVENT=${eventName}"`,
    'set "YIRU_ANTIGRAVITY_CORE=%~dp0antigravity-hook.cmd"',
    'if exist "%YIRU_ANTIGRAVITY_CORE%" (',
    '  call "%YIRU_ANTIGRAVITY_CORE%"',
    '  exit /b 0',
    ')',
    'if /I "%YIRU_ANTIGRAVITY_EVENT%"=="Stop" (',
    '  echo {"decision":""}',
    ') else (',
    '  echo {}',
    ')',
    // Why: without the shared core, this wrapper owns and must drain stdin.
    WINDOWS_HOOK_STDIN_DRAIN_COMMAND,
    'exit /b 0',
    ''
  ].join('\r\n')
}

function buildWindowsAntigravityHookPostCommand(): string {
  // Why: status updates are best-effort and must not hold the agent open.
  return `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$utf8=[System.Text.UTF8Encoding]::new($false); [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $inputData=[Console]::In.ReadToEnd(); try { $payload=if ([string]::IsNullOrWhiteSpace($inputData)) { @{} } else { $inputData | ConvertFrom-Json }; $body=@{ paneKey=$env:YIRU_PANE_KEY; launchToken=$env:YIRU_AGENT_LAUNCH_TOKEN; tabId=$env:YIRU_TAB_ID; worktreeId=$env:YIRU_WORKTREE_ID; env=$env:YIRU_AGENT_HOOK_ENV; version=$env:YIRU_AGENT_HOOK_VERSION; hook_event_name=$env:YIRU_ANTIGRAVITY_EVENT; payload=$payload } | ConvertTo-Json -Depth 100 -Compress; $bodyBytes=$utf8.GetBytes($body); Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:YIRU_AGENT_HOOK_PORT + '/hook/antigravity') -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-Yiru-Agent-Hook-Token'=$env:YIRU_AGENT_HOOK_TOKEN } -Body $bodyBytes -TimeoutSec 2 | Out-Null } catch {}"`
}
