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

export function readEmbeddedExecCommands(source: string): string[] {
  const commands: string[] = []
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
    const command = readShellCommand(parseCommandInputJson(objectSource))
    if (command) {
      commands.push(command)
    }
    cursor = objectStart + objectSource.length
  }
  return commands
}

function balancedObjectAt(source: string, start: number): string | null {
  let depth = 0
  let quote: 'single' | 'double' | null = null
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
    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      continue
    }
    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      continue
    }
    if (quote !== null) {
      continue
    }
    if (character === '{') {
      depth += 1
    } else if (character === '}' && --depth === 0) {
      return source.slice(start, index + 1)
    }
  }
  return null
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
