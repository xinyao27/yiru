import type { NativeChatToolResultBlock } from '@yiru/workbench-model/agent'

export type JsonRecord = Record<string, unknown>

export type ParsedResult = {
  record: JsonRecord | null
  status: 'running' | 'success' | 'error' | 'unknown'
  errorMessage: string | null
}

export function parseResults(
  result: NativeChatToolResultBlock | undefined,
  resultIndexes: readonly (number | null)[]
): ParsedResult[] {
  if (resultIndexes.length === 0) {
    return []
  }
  if (!result) {
    return resultIndexes.map(() => ({
      record: null,
      status: 'running',
      errorMessage: null
    }))
  }
  const records = findJsonRecords(result.output)
  return resultIndexes.map((resultIndex) => {
    const output = resultIndex === null ? null : result.outputSegments?.[resultIndex]
    const record = result.outputSegments
      ? output
        ? (findJsonRecords(output)[0] ?? null)
        : null
      : (records[resultIndex ?? -1] ?? null)
    const hasLinkedResult =
      resultIndex !== null && (result.outputSegments === undefined || output !== undefined)
    return parsedResult(
      result,
      record,
      resultIndexes.length === 1,
      output ?? result.output,
      hasLinkedResult
    )
  })
}

function parsedResult(
  result: NativeChatToolResultBlock,
  record: JsonRecord | null,
  useGlobalError: boolean,
  output: string,
  hasLinkedResult: boolean
): ParsedResult {
  const errorRecord = isRecord(record?.error) ? record.error : null
  const isError =
    (useGlobalError && result.isError === true) ||
    record?.ok === false ||
    (typeof record?.exit_code === 'number' && record.exit_code !== 0)
  return {
    record,
    status: isError
      ? 'error'
      : !hasLinkedResult || (result.outputSegments !== undefined && record === null)
        ? 'unknown'
        : 'success',
    errorMessage: isError
      ? (readString(errorRecord, 'message') ??
        firstUsefulOutputLine(readString(record, 'output') ?? output))
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

function findJsonRecords(output: string): JsonRecord[] {
  const direct = parseJson(output.trim())
  if (isRecord(direct)) {
    return recordsFromEnvelope(direct)
  }
  const records: JsonRecord[] = []
  let cursor = 0
  while (cursor < output.length) {
    const start = output.indexOf('{', cursor)
    if (start === -1) {
      break
    }
    const candidate = jsonRecordAt(output, start)
    if (!candidate) {
      cursor = start + 1
      continue
    }
    records.push(...recordsFromEnvelope(candidate.record))
    cursor = candidate.end + 1
  }
  return records
}

function jsonRecordAt(output: string, start: number): { record: JsonRecord; end: number } | null {
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
      const record = parseJson(output.slice(start, index + 1))
      return isRecord(record) ? { record, end: index } : null
    }
  }
  return null
}

function recordsFromEnvelope(record: JsonRecord): JsonRecord[] {
  const nestedOutput = readString(record, 'output')
  if (typeof record.exit_code !== 'number' || !nestedOutput) {
    return [record]
  }
  const nestedRecords = findJsonRecords(nestedOutput)
  return nestedRecords.length > 0 ? nestedRecords : [record]
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
