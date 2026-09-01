import type { ParsedWarpThemeResult, ParseWarpThemeOptions } from './parser'
import { parseWarpThemeYaml } from './parser'

type WarpThemeParserEntryRequest = {
  content: string
  fileLabel: string
  options: ParseWarpThemeOptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function readRequest(value: unknown): WarpThemeParserEntryRequest | null {
  if (
    !isRecord(value) ||
    typeof value.content !== 'string' ||
    typeof value.fileLabel !== 'string' ||
    !isRecord(value.options) ||
    !isOptionalString(value.options.idDiscriminator) ||
    !isOptionalString(value.options.idSuffix) ||
    !isOptionalString(value.options.importedAt) ||
    !isOptionalString(value.options.sourceLabel)
  ) {
    return null
  }
  return {
    content: value.content,
    fileLabel: value.fileLabel,
    options: {
      idDiscriminator: value.options.idDiscriminator,
      idSuffix: value.options.idSuffix,
      importedAt: value.options.importedAt,
      sourceLabel: value.options.sourceLabel
    }
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function runWarpThemeParserEntry(): Promise<void> {
  let result: ParsedWarpThemeResult
  try {
    const request = readRequest(JSON.parse(await readStdin()))
    result = request
      ? parseWarpThemeYaml(request.content, request.fileLabel, request.options)
      : { ok: false, reason: 'Theme parser received an invalid request.' }
  } catch (error) {
    result = {
      ok: false,
      reason: error instanceof Error ? error.message : 'Invalid YAML'
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
