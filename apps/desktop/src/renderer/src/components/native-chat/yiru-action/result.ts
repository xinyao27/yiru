import type { NativeChatToolResultBlock } from '@yiru/workbench-model/agent'

export type JsonRecord = Record<string, unknown>

export type ParsedResult = {
  record: JsonRecord | null
  status: 'running' | 'success' | 'error'
  errorMessage: string | null
}

export function parseResult(result: NativeChatToolResultBlock | undefined): ParsedResult {
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

export function readResultString(
  record: JsonRecord | null,
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

export function readFirstResultString(
  record: JsonRecord | null,
  parents: readonly string[],
  field: string
): string | null {
  for (const parent of parents) {
    const value = readResultString(record, 'result', parent, field)
    if (value) {
      return value
    }
  }
  return null
}

export function readPayloadString(result: ParsedResult, ...path: readonly string[]): string | null {
  return readResultString(result.record, 'result', ...path)
}

function findJsonRecord(output: string): JsonRecord | null {
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: JsonRecord | null, key: string): string | null {
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
