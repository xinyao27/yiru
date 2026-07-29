import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '@yiru/workbench-model/agent'

export type YiruJsonRecord = Record<string, unknown>

export type ParsedYiruCommand = {
  tokens: string[]
}

export type ParsedYiruResult = {
  record: YiruJsonRecord | null
  status: 'running' | 'success' | 'error'
  errorMessage: string | null
}

const SHELL_TOOL_NAMES = new Set([
  'bash',
  'execcommand',
  'execute',
  'localshell',
  'powershell',
  'runcommand',
  'runshellcommand',
  'runterminalcmd',
  'runterminalcommand',
  'shellcommand',
  'terminal'
])

export function parseYiruCommand(call: NativeChatToolCallBlock): ParsedYiruCommand | null {
  if (!SHELL_TOOL_NAMES.has(call.name.replaceAll(/[^a-z0-9]/gi, '').toLowerCase())) {
    return null
  }
  const command = shellCommandFromInput(call.input)
  if (!command) {
    return null
  }
  const tokens = tokenizeShellCommand(command)
  const executable = tokens[0]?.toLowerCase()
  // Why: the PTY owner constrains YIRU_CLI_COMMAND to these names, so the
  // renderer can recognize the exported value without a new process contract.
  if (executable !== 'yiru' && executable !== 'yiru-dev') {
    return null
  }
  return { tokens }
}

export function parseYiruResult(result: NativeChatToolResultBlock | undefined): ParsedYiruResult {
  if (!result) {
    return { record: null, status: 'running', errorMessage: null }
  }
  const record = findJsonRecord(result.output)
  const errorRecord = isRecord(record?.error) ? record.error : null
  const isError = result.isError === true || record?.ok === false
  return {
    record,
    status: isError ? 'error' : 'success',
    errorMessage: isError
      ? (readString(errorRecord, 'message') ?? firstUsefulOutputLine(result.output))
      : null
  }
}

export function yiruFlag(tokens: readonly string[], name: string): string | null {
  const prefix = `--${name}=`
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token.startsWith(prefix)) {
      return token.slice(prefix.length)
    }
    if (token === `--${name}`) {
      const value = tokens[index + 1]
      return value && !value.startsWith('--') ? value : null
    }
  }
  return null
}

export function yiruPositional(tokens: readonly string[], startIndex: number): string | null {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (!token.startsWith('-')) {
      return token
    }
  }
  return null
}

export function yiruResultString(
  record: YiruJsonRecord | null,
  ...path: readonly string[]
): string | null {
  let value: unknown = record
  for (const segment of path) {
    if (!isRecord(value)) {
      return null
    }
    value = value[segment]
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function yiruFirstResultString(
  record: YiruJsonRecord | null,
  parents: readonly string[],
  field: string
): string | null {
  for (const parent of parents) {
    const value = yiruResultString(record, 'result', parent, field)
    if (value) {
      return value
    }
  }
  return null
}

function shellCommandFromInput(input: unknown): string | null {
  if (typeof input === 'string') {
    const parsed = parseJson(input)
    return parsed === null ? input : shellCommandFromInput(parsed)
  }
  if (!isRecord(input)) {
    return null
  }
  for (const key of ['command', 'cmd', 'CommandLine']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return shellCommandFromInput(input.action)
}

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: 'single' | 'double' | null = null
  let escaping = false
  const commit = (): void => {
    if (token) {
      tokens.push(token)
      token = ''
    }
  }
  for (const character of command.trim()) {
    if (escaping) {
      token += character
      escaping = false
    } else if (character === '\\' && quote !== 'single') {
      escaping = true
    } else if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
    } else if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
    } else if (/\s/.test(character) && quote === null) {
      commit()
    } else {
      token += character
    }
  }
  if (escaping) {
    token += '\\'
  }
  commit()
  return tokens
}

function findJsonRecord(output: string): YiruJsonRecord | null {
  const direct = parseJson(output.trim())
  if (isRecord(direct)) {
    return direct
  }
  for (let start = output.indexOf('{'); start !== -1; start = output.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaping = false
    for (let index = start; index < output.length; index += 1) {
      const character = output[index]!
      if (inString) {
        if (escaping) {
          escaping = false
        } else if (character === '\\') {
          escaping = true
        } else if (character === '"') {
          inString = false
        }
        continue
      }
      if (character === '"') {
        inString = true
      } else if (character === '{') {
        depth += 1
      } else if (character === '}' && --depth === 0) {
        const candidate = parseJson(output.slice(start, index + 1))
        if (isRecord(candidate)) {
          return candidate
        }
        break
      }
    }
  }
  return null
}

function parseJson(value: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is YiruJsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: YiruJsonRecord | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstUsefulOutputLine(output: string): string | null {
  const line = output
    .split('\n')
    .map((candidate) => candidate.trim())
    .find(
      (candidate) =>
        candidate && !/^(Chunk ID|Wall time|Process exited|Final output):?/i.test(candidate)
    )
  return line ? (line.length > 180 ? `${line.slice(0, 179)}…` : line) : null
}
