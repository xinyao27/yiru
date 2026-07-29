import type { NativeChatToolCallBlock } from '@yiru/workbench-model/agent'

export type ParsedCommand = {
  tokens: string[]
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

export function parseCommands(call: NativeChatToolCallBlock): ParsedCommand[] {
  if (!SHELL_TOOL_NAMES.has(call.name.replaceAll(/[^a-z0-9]/gi, '').toLowerCase())) {
    return []
  }
  const command = shellCommandFromInput(call.input)
  if (!command) {
    return []
  }
  const parsed: ParsedCommand[] = []
  for (const tokens of tokenizeShellSegments(command)) {
    const invocationStart = findInvocationStart(tokens)
    if (invocationStart !== null) {
      parsed.push({ tokens: tokens.slice(invocationStart) })
    }
  }
  return parsed
}

export function readFlag(tokens: readonly string[], name: string): string | null {
  const prefix = `--${name}=`
  const shortName = name === 'terminal' ? '-t' : null
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token === '--') {
      return null
    }
    if (token.startsWith(prefix)) {
      return token.slice(prefix.length)
    }
    if (token === `--${name}` || token === shortName) {
      const value = tokens[index + 1]
      return value && value !== '--' && !value.startsWith('--') ? value : null
    }
    if (shortName && token.startsWith(`${shortName}=`)) {
      return token.slice(shortName.length + 1)
    }
  }
  return null
}

export function readPositional(tokens: readonly string[], startIndex: number): string | null {
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (!token.startsWith('-')) {
      return token
    }
  }
  return null
}

function shellCommandFromInput(input: unknown): string | null {
  if (typeof input === 'string') {
    const parsed = parseInputJson(input)
    return parsed === null ? input : shellCommandFromInput(parsed)
  }
  if (!isInputRecord(input)) {
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

function tokenizeShellSegments(command: string): string[][] {
  const segments: string[][] = []
  let tokens: string[] = []
  let token = ''
  let quote: 'single' | 'double' | null = null
  let escaping = false
  const commitToken = (): void => {
    if (token) {
      tokens.push(token)
      token = ''
    }
  }
  const commitSegment = (): void => {
    commitToken()
    if (tokens.length > 0) {
      segments.push(tokens)
      tokens = []
    }
  }
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (escaping) {
      token += character
      escaping = false
    } else if (
      character === '\\' &&
      quote !== 'single' &&
      shouldEscapeBackslash(token, command[index + 1], quote)
    ) {
      escaping = true
    } else if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
    } else if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
    } else if (/\s/.test(character) && quote === null) {
      commitToken()
    } else if (quote === null && (character === ';' || character === '|')) {
      commitSegment()
      if (command[index + 1] === character) {
        index += 1
      }
    } else if (quote === null && character === '&' && command[index + 1] === '&') {
      commitSegment()
      index += 1
    } else {
      token += character
    }
  }
  if (escaping) {
    token += '\\'
  }
  commitSegment()
  return segments
}

function shouldEscapeBackslash(
  token: string,
  nextCharacter: string | undefined,
  quote: 'single' | 'double' | null
): boolean {
  if (nextCharacter === undefined || /^[A-Za-z]:/.test(token) || token.startsWith('\\')) {
    return false
  }
  if (quote === 'double') {
    return ['"', '$', '\\', '`', '\n'].includes(nextCharacter)
  }
  return true
}

function findInvocationStart(tokens: readonly string[]): number | null {
  let index = 0
  while (isEnvironmentAssignment(tokens[index])) {
    index += 1
  }
  if (executableBasename(tokens[index]) === 'env') {
    index = skipEnvironmentPrefix(tokens, index + 1)
  }
  return isYiruExecutable(tokens[index]) ? index : null
}

function skipEnvironmentPrefix(tokens: readonly string[], startIndex: number): number {
  let index = startIndex
  while (index < tokens.length) {
    const token = tokens[index]!
    if (token === '--') {
      index += 1
      continue
    }
    if (isEnvironmentAssignment(token)) {
      index += 1
      continue
    }
    if (['-u', '--unset', '-C', '--chdir', '-S', '--split-string'].includes(token)) {
      index += 2
      continue
    }
    if (token.startsWith('-')) {
      index += 1
      continue
    }
    return index
  }
  return index
}

function isEnvironmentAssignment(token: string | undefined): boolean {
  return token !== undefined && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
}

function isYiruExecutable(token: string | undefined): boolean {
  if (token === '$YIRU_CLI_COMMAND') {
    return true
  }
  const executable = executableBasename(token)
  return executable === 'yiru' || executable === 'yiru-dev'
}

function executableBasename(token: string | undefined): string | null {
  const basename = token?.split(/[\\/]/).at(-1)?.toLowerCase()
  return basename || null
}

function parseInputJson(value: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed
  } catch {
    return null
  }
}

function isInputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
