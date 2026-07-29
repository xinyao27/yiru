export function readShellCommand(input: unknown): string | null {
  if (typeof input === 'string') {
    const parsed = parseCommandInputJson(input)
    return parsed === null ? input : readShellCommand(parsed)
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
  return readShellCommand(input.action)
}

export type IndexedShellCommand = {
  command: string
  resultIndex: number | null
}

type ExtractedExecCommand = {
  command: string
  binding: string | null
  markerIndex: number
}

export function readEmbeddedExecCommands(source: string): IndexedShellCommand[] {
  const commands: ExtractedExecCommand[] = []
  const marker = 'tools.exec_command'
  let cursor = 0
  while (cursor < source.length) {
    const markerIndex = source.indexOf(marker, cursor)
    if (markerIndex === -1) {
      break
    }
    const callStart = source.indexOf('(', markerIndex + marker.length)
    const objectStart = callStart === -1 ? -1 : source.indexOf('{', callStart + 1)
    if (objectStart === -1) {
      cursor = markerIndex + marker.length
      continue
    }
    const objectSource = balancedObjectAt(source, objectStart)
    if (!objectSource) {
      cursor = objectStart + 1
      continue
    }
    const command =
      readShellCommand(parseCommandInputJson(objectSource)) ??
      readObjectLiteralCommand(objectSource)
    if (command) {
      commands.push({ command, binding: readExecBinding(source, markerIndex), markerIndex })
    }
    cursor = objectStart + objectSource.length
  }
  const resultIndexes = readExecResultIndexes(source, commands)
  return commands.map((command, index) => ({
    command: command.command,
    resultIndex: resultIndexes[index] ?? null
  }))
}

function balancedObjectAt(source: string, start: number): string | null {
  return balancedRangeAt(source, start, '{', '}')
}

function balancedRangeAt(
  source: string,
  start: number,
  opening: '{' | '(',
  closing: '}' | ')'
): string | null {
  let depth = 0
  let quote: 'single' | 'double' | 'template' | null = null
  let escaping = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!
    if (escaping) {
      escaping = false
      continue
    }
    if (character === '\\' && quote !== null) {
      escaping = true
      continue
    }
    if (character === "'" && (quote === null || quote === 'single')) {
      quote = quote === 'single' ? null : 'single'
      continue
    }
    if (character === '"' && (quote === null || quote === 'double')) {
      quote = quote === 'double' ? null : 'double'
      continue
    }
    if (character === '`' && quote === null) {
      quote = 'template'
      continue
    }
    if (character === '`' && quote === 'template') {
      quote = null
      continue
    }
    if (quote !== null) {
      continue
    }
    if (character === opening) {
      depth += 1
    } else if (character === closing && --depth === 0) {
      return source.slice(start, index + 1)
    }
  }
  return null
}

function readExecBinding(source: string, markerIndex: number): string | null {
  const prefix = source.slice(Math.max(0, markerIndex - 160), markerIndex)
  return (
    prefix.match(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:await\s+)?$/)?.[1] ?? null
  )
}

function readExecResultIndexes(
  source: string,
  commands: readonly ExtractedExecCommand[]
): (number | null)[] {
  const resultIndexes: (number | null)[] = commands.map(() => null)
  const ambiguousCommands = new Set<number>()
  const outputCall = /\b(?:text|notify)\s*\(/g
  let outputIndex = 0
  for (let match = outputCall.exec(source); match; match = outputCall.exec(source)) {
    const callStart = source.indexOf('(', match.index)
    const callSource = balancedRangeAt(source, callStart, '(', ')')
    if (!callSource) {
      continue
    }
    const callEnd = callStart + callSource.length
    const referencedCommands = commands.flatMap((command, index) =>
      referencesExecCommand(callSource, callStart, callEnd, command) ? [index] : []
    )
    if (referencedCommands.length === 1) {
      const commandIndex = referencedCommands[0]!
      if (resultIndexes[commandIndex] === null && !ambiguousCommands.has(commandIndex)) {
        resultIndexes[commandIndex] = outputIndex
      } else {
        resultIndexes[commandIndex] = null
        ambiguousCommands.add(commandIndex)
      }
    }
    outputIndex += 1
    outputCall.lastIndex = callEnd
  }
  return resultIndexes
}

function referencesExecCommand(
  callSource: string,
  callStart: number,
  callEnd: number,
  command: ExtractedExecCommand
): boolean {
  if (command.markerIndex >= callStart && command.markerIndex < callEnd) {
    return true
  }
  if (!command.binding) {
    return false
  }
  const binding = command.binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${binding}\\s*(?:\\.\\s*output\\b|\\))`).test(callSource)
}

function readObjectLiteralCommand(source: string): string | null {
  const commandProperty =
    /(?:^|[{,])\s*(?:(["'])(cmd|command|CommandLine)\1|(cmd|command|CommandLine))\s*:\s*(["'`])/g
  const match = commandProperty.exec(source)
  const quote = match?.[4]
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return null
  }
  return readJavaScriptString(source, commandProperty.lastIndex, quote)
}

function readJavaScriptString(
  source: string,
  start: number,
  quote: "'" | '"' | '`'
): string | null {
  let value = ''
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!
    if (character === quote) {
      return value
    }
    if (quote === '`' && character === '$' && source[index + 1] === '{') {
      return null
    }
    if (character !== '\\') {
      value += character
      continue
    }
    const escaped = source[++index]
    if (escaped === undefined) {
      return null
    }
    if (escaped === '\n') {
      continue
    }
    if (escaped === '\r') {
      if (source[index + 1] === '\n') {
        index += 1
      }
      continue
    }
    const decoded = decodeJavaScriptEscape(source, escaped, index)
    value += decoded.value
    index += decoded.extraWidth
  }
  return null
}

function decodeJavaScriptEscape(
  source: string,
  escaped: string,
  index: number
): { value: string; extraWidth: number } {
  const simpleEscape = SIMPLE_JAVASCRIPT_ESCAPES[escaped]
  if (simpleEscape !== undefined) {
    return { value: simpleEscape, extraWidth: 0 }
  }
  const width = escaped === 'x' ? 2 : escaped === 'u' ? 4 : 0
  const digits = width ? source.slice(index + 1, index + 1 + width) : ''
  if (width && new RegExp(`^[0-9a-fA-F]{${width}}$`).test(digits)) {
    return { value: String.fromCodePoint(Number.parseInt(digits, 16)), extraWidth: width }
  }
  return { value: escaped, extraWidth: 0 }
}

export function parseCommandInputJson(value: string): unknown | null {
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
const SIMPLE_JAVASCRIPT_ESCAPES: Record<string, string> = {
  '0': '\0',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v'
}
