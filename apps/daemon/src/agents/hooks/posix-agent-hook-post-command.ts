import type { AgentHookSource } from '~main/agents/core/hook-relay'

// Why: split out of managed-hook-commands.ts to stay under the 300-line budget —
// this type plus buildPosixAgentHookCurlPostCommand pushed that file over.
// Copilot's hookEventName, Grok's grokHome, and Antigravity's hook_event_name
// are the only provider-specific fields the POSIX curl block has ever needed.
export type PosixAgentHookExtraField = { key: string; value: string }

function formatPosixHookDataUrlencodeField(field: PosixAgentHookExtraField): string {
  return `  --data-urlencode "${field.key}=${field.value}" \\`
}

// Why: mirrors buildWindowsAgentHookCurlPostCommand (managed-hook-commands.ts) — same
// wire fields and the same `/hook/<source>` endpoint routing, so POSIX and
// Windows hook posts diverge only in shell syntax. `fieldsBeforeEnv` lands
// before `env` (Copilot's hookEventName); `fieldsAfterVersion` lands after
// `version`, before the piped payload (Grok's grokHome, Antigravity's
// hook_event_name) — the two insertion points every provider so far has used.
export function buildPosixAgentHookCurlPostCommand(
  source: AgentHookSource,
  options: {
    fieldsBeforeEnv?: PosixAgentHookExtraField[]
    fieldsAfterVersion?: PosixAgentHookExtraField[]
  } = {}
): string {
  return [
    `printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:\${YIRU_AGENT_HOOK_PORT}/hook/${source}" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${YIRU_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${YIRU_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \\',
    ...(options.fieldsBeforeEnv ?? []).map(formatPosixHookDataUrlencodeField),
    '  --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \\',
    ...(options.fieldsAfterVersion ?? []).map(formatPosixHookDataUrlencodeField),
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || true'
  ].join('\n')
}
