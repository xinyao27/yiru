import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import type { AgentHookSource } from './hook-relay'

export const HOOK_SOURCE_BY_PATHNAME: Readonly<Record<string, AgentHookSource>> = Object.freeze({
  '/hook/claude': 'claude',
  '/hook/codex': 'codex',
  '/hook/gemini': 'gemini',
  '/hook/antigravity': 'antigravity',
  '/hook/amp': 'amp',
  '/hook/opencode': 'opencode',
  '/hook/mimo-code': 'mimo-code',
  '/hook/cursor': 'cursor',
  '/hook/pi': 'pi',
  '/hook/omp': 'omp',
  '/hook/droid': 'droid',
  '/hook/command-code': 'command-code',
  '/hook/grok': 'grok',
  '/hook/copilot': 'copilot',
  '/hook/hermes': 'hermes',
  '/hook/devin': 'devin',
  '/hook/kimi': 'kimi'
})

export function resolveHookSource(pathname: string): AgentHookSource | null {
  return HOOK_SOURCE_BY_PATHNAME[pathname] ?? null
}

// ─── Endpoint-file writing ──────────────────────────────────────────

export function getEndpointFileName(): string {
  // Why: per-platform extension lets hook scripts source the file natively
  // (`. "$file"` POSIX, `call "%file%"` Windows). The OpenCode plugin's regex
  // accepts both shapes already.
  return process.platform === 'win32' ? 'endpoint.cmd' : 'endpoint.env'
}

export function isShellSafeEndpointValue(value: string): boolean {
  // Why: every value in the endpoint file is sourced as shell. The `+`
  // quantifier rejects empty strings as defense-in-depth — a sourced empty
  // `KEY=` would clear the env var in the sourcing shell.
  return /^[A-Za-z0-9._:/-]+$/.test(value)
}

export type EndpointFileFields = {
  port: number
  token: string
  env: string
  version: string
}

/** Atomically write the endpoint file at `endpointDir/<getEndpointFileName()>`.
 *  Returns true on success, false on any error (caller may fall back to PTY
 *  env). Mirrors `AgentHookServer.writeEndpointFile` and is shared verbatim by
 *  the relay's adapter. */
export function writeEndpointFile(
  endpointDir: string,
  finalPath: string,
  fields: EndpointFileFields
): boolean {
  const tmpPath = join(endpointDir, `.endpoint-${process.pid}-${randomUUID()}.tmp`)
  const prefix = process.platform === 'win32' ? 'set ' : ''
  const valuesToWrite: [string, string][] = [
    ['YIRU_AGENT_HOOK_PORT', String(fields.port)],
    ['YIRU_AGENT_HOOK_TOKEN', fields.token],
    ['YIRU_AGENT_HOOK_ENV', fields.env],
    ['YIRU_AGENT_HOOK_VERSION', fields.version]
  ]
  for (const [key, value] of valuesToWrite) {
    if (!isShellSafeEndpointValue(value)) {
      console.error(
        `[agent-hooks] refusing to write endpoint file: ${key} contains ` +
          'characters unsafe for shell sourcing. Falling back to PTY env.'
      )
      return false
    }
  }
  const lines = [...valuesToWrite.map(([key, value]) => `${prefix}${key}=${value}`), '']
  let tmpWritten = false
  try {
    // Why: 0o700 — match the file's owner-only policy so the directory does
    // not leak the existence of this Yiru/relay install to other local users.
    mkdirSync(endpointDir, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') {
      // Why: mkdirSync's mode only applies on creation — a pre-existing
      // directory keeps its original perms. POSIX-only chmod fix.
      try {
        chmodSync(endpointDir, 0o700)
      } catch {
        // best-effort
      }
    }
    // Why: sweep stale `.endpoint-*.tmp` orphans older than 5 min so a crash
    // between writeFileSync and renameSync cannot grow the dir unboundedly.
    try {
      const entries = readdirSync(endpointDir)
      const cutoff = Date.now() - 5 * 60 * 1000
      for (const entry of entries) {
        if (!entry.startsWith('.endpoint-') || !entry.endsWith('.tmp')) {
          continue
        }
        const entryPath = join(endpointDir, entry)
        try {
          if (statSync(entryPath).mtimeMs < cutoff) {
            unlinkSync(entryPath)
          }
        } catch {
          // best-effort sweep
        }
      }
    } catch {
      // readdirSync can fail on exotic filesystems
    }
    const separator = process.platform === 'win32' ? '\r\n' : '\n'
    writeFileSync(tmpPath, lines.join(separator), { mode: 0o600 })
    tmpWritten = true
    renameSync(tmpPath, finalPath)
    return true
  } catch (err) {
    console.error('[agent-hooks] failed to write endpoint file:', err)
    if (tmpWritten) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // tmp may already be gone
      }
    }
    return false
  }
}
