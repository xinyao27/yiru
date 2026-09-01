import {
  buildPosixHookEnvironmentGuardLines,
  buildPosixHookPayloadCapture
} from '../hooks/hook-stdin-contract'
import { buildPosixAgentHookCurlPostCommand } from '../hooks/managed-hook-commands'

export function getCopilotManagedScript(target: 'local' | 'posix' = 'local'): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      "Write-Output '{}'",
      '$inputData = [Console]::In.ReadToEnd()',
      // Why: endpoint.cmd is cmd syntax, not PowerShell. Parse its `set KEY=...`
      // lines so surviving PTYs can refresh to the current runtime host.
      'if ($env:YIRU_AGENT_HOOK_ENDPOINT -and (Test-Path -LiteralPath $env:YIRU_AGENT_HOOK_ENDPOINT)) {',
      '  try {',
      '    Get-Content -LiteralPath $env:YIRU_AGENT_HOOK_ENDPOINT | ForEach-Object {',
      "      if ($_ -match '^set ([A-Za-z0-9_]+)=(.*)$') {",
      "        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')",
      '      }',
      '    }',
      '  } catch {}',
      '}',
      'if (-not $env:YIRU_AGENT_HOOK_PORT -or -not $env:YIRU_AGENT_HOOK_TOKEN -or -not $env:YIRU_PANE_KEY) { exit 0 }',
      'if ([string]::IsNullOrWhiteSpace($inputData)) { exit 0 }',
      'try {',
      '  $payload = $inputData | ConvertFrom-Json',
      '  $body = @{',
      '    paneKey = $env:YIRU_PANE_KEY',
      '    launchToken = $env:YIRU_AGENT_LAUNCH_TOKEN',
      '    tabId = $env:YIRU_TAB_ID',
      '    worktreeId = $env:YIRU_WORKTREE_ID',
      '    hookEventName = $env:YIRU_COPILOT_HOOK_EVENT',
      '    env = $env:YIRU_AGENT_HOOK_ENV',
      '    version = $env:YIRU_AGENT_HOOK_VERSION',
      '    payload = $payload',
      '  } | ConvertTo-Json -Depth 100',
      "  Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:' + $env:YIRU_AGENT_HOOK_PORT + '/hook/copilot') -Headers @{ 'Content-Type'='application/json'; 'X-Yiru-Agent-Hook-Token'=$env:YIRU_AGENT_HOOK_TOKEN } -Body $body -TimeoutSec 2 | Out-Null",
      '} catch {}',
      'exit 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    "printf '{}\\n'",
    ...buildPosixHookPayloadCapture(),
    // Why: Copilot consumes stdout for some hooks, so stdout is emitted before
    // endpoint refresh, stdin parsing, or the network POST can fail.
    ...buildPosixHookEnvironmentGuardLines(),
    buildPosixAgentHookCurlPostCommand('copilot', {
      fieldsBeforeEnv: [{ key: 'hookEventName', value: '${YIRU_COPILOT_HOOK_EVENT}' }]
    }),
    'exit 0',
    ''
  ].join('\n')
}
