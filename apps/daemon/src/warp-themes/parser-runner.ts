import { spawn } from 'node:child_process'

import {
  resolveInternalEntryInvocation,
  WARP_THEME_PARSE_ENTRY_COMMAND
} from '../runtime/internal-entry'
import type { ParsedWarpThemeResult, ParseWarpThemeOptions } from './parser'

export const WARP_THEME_PARSE_TIMEOUT_MS = 1_000

const MAX_RESULT_BYTES = 1024 * 1024

type ParseWarpThemeTimeoutOptions = {
  timeoutMs?: number
}

type WarpThemeParserEntryRequest = {
  content: string
  fileLabel: string
  options: ParseWarpThemeOptions
}

function isParsedWarpThemeResult(value: unknown): value is ParsedWarpThemeResult {
  return Boolean(
    value && typeof value === 'object' && 'ok' in value && (value.ok === true || value.ok === false)
  )
}

export function parseWarpThemeYamlWithTimeout(
  content: string,
  fileLabel: string,
  options: ParseWarpThemeOptions = {},
  timeoutOptions: ParseWarpThemeTimeoutOptions = {}
): Promise<ParsedWarpThemeResult> {
  const timeoutMs = Math.max(
    0,
    Math.min(WARP_THEME_PARSE_TIMEOUT_MS, timeoutOptions.timeoutMs ?? WARP_THEME_PARSE_TIMEOUT_MS)
  )
  const invocation = resolveInternalEntryInvocation(WARP_THEME_PARSE_ENTRY_COMMAND)
  const request: WarpThemeParserEntryRequest = { content, fileLabel, options }

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      env: { ...process.env }
    })
    let isSettled = false
    let output = ''

    const settle = (result: ParsedWarpThemeResult): void => {
      if (isSettled) {
        return
      }
      isSettled = true
      clearTimeout(timeout)
      resolve(result)
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      settle({ ok: false, reason: 'Theme file took too long to parse.' })
    }, timeoutMs)
    timeout.unref?.()

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (Buffer.byteLength(output) > MAX_RESULT_BYTES) {
        child.kill('SIGKILL')
        settle({ ok: false, reason: 'Theme parser returned an invalid result.' })
      }
    })
    child.once('error', () => {
      settle({ ok: false, reason: 'Invalid YAML' })
    })
    child.once('exit', (code) => {
      if (isSettled) {
        return
      }
      const line = output.trim().split('\n').at(-1)
      if (code !== 0 || !line) {
        settle({ ok: false, reason: 'Theme parser exited before returning a result.' })
        return
      }
      try {
        const result: unknown = JSON.parse(line)
        settle(
          isParsedWarpThemeResult(result)
            ? result
            : { ok: false, reason: 'Theme parser returned an invalid result.' }
        )
      } catch {
        settle({ ok: false, reason: 'Theme parser returned an invalid result.' })
      }
    })
    child.stdin.end(JSON.stringify(request))
  })
}
