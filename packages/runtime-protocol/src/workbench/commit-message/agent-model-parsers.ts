import { labelFromModelId, uniqueModels, withOpenAiThinking } from './agent-model-metadata'
import type { CommitMessageModel } from './agent-spec-types'

function* iterateModelOutputLines(output: string): Generator<string> {
  let lineStart = 0
  for (let index = 0; index < output.length; index++) {
    const code = output.charCodeAt(index)
    if (code !== 10 && code !== 13) {
      continue
    }
    yield output.slice(lineStart, index)
    if (code === 13 && output.charCodeAt(index + 1) === 10) {
      index++
    }
    lineStart = index + 1
  }
  if (lineStart <= output.length) {
    yield output.slice(lineStart)
  }
}

export function parseCodexModels(stdout: string): CommitMessageModel[] {
  try {
    const parsed = JSON.parse(stdout) as {
      models?: {
        slug?: string
        display_name?: string
        supported_reasoning_levels?: { effort?: string }[]
        default_reasoning_level?: string
      }[]
    }
    return uniqueModels(
      (parsed.models ?? [])
        .filter((model): model is typeof model & { slug: string; display_name: string } =>
          Boolean(model.slug && model.display_name)
        )
        .map((model) => ({
          id: model.slug,
          label: model.display_name,
          ...(model.supported_reasoning_levels?.length
            ? {
                thinkingLevels: model.supported_reasoning_levels
                  .map((level) => level.effort)
                  .filter((effort): effort is string => Boolean(effort))
                  .map((effort) => ({
                    id: effort,
                    label: effort === 'xhigh' ? 'Extra High' : labelFromModelId(effort)
                  })),
                defaultThinkingLevel: model.default_reasoning_level ?? 'low'
              }
            : {})
        }))
    )
  } catch {
    return []
  }
}

export function parseLineModels(stdout: string): CommitMessageModel[] {
  const models: CommitMessageModel[] = []
  for (const rawLine of iterateModelOutputLines(stdout)) {
    const id = rawLine.trim()
    if (id.length > 0 && !id.includes(' ')) {
      models.push({ id, label: labelFromModelId(id), ...withOpenAiThinking(id) })
    }
  }
  return uniqueModels(models)
}

export function parsePiModels(stdout: string): CommitMessageModel[] {
  const models: CommitMessageModel[] = []
  for (const rawLine of iterateModelOutputLines(stdout)) {
    const parts = getPiModelTableFields(rawLine, 6)
    if (parts.length < 6 || parts[0] === 'provider') {
      continue
    }
    const [provider, model, , , thinking] = parts
    models.push({
      id: `${provider}/${model}`,
      label: `${labelFromModelId(provider)} ${labelFromModelId(model)}`,
      ...(thinking === 'yes'
        ? {
            thinkingLevels: [
              { id: 'off', label: 'Off' },
              { id: 'low', label: 'Low' },
              { id: 'medium', label: 'Medium' },
              { id: 'high', label: 'High' },
              { id: 'xhigh', label: 'Extra High' }
            ],
            defaultThinkingLevel: 'low'
          }
        : {})
    })
  }
  return uniqueModels(models)
}

export function parseCursorModels(stdout: string): CommitMessageModel[] {
  const models: CommitMessageModel[] = []
  for (const rawLine of iterateModelOutputLines(stdout)) {
    const match = /^([^\s]+)\s+-\s+(.+)$/.exec(rawLine.trim())
    if (match) {
      models.push({
        id: match[1],
        label: match[2].replace(/\s+\((?:default|current)\)$/i, ''),
        ...withOpenAiThinking(match[1])
      })
    }
  }
  return uniqueModels(models)
}

export function parseAntigravityModels(stdout: string): CommitMessageModel[] {
  const models: CommitMessageModel[] = []
  for (const rawLine of iterateModelOutputLines(stdout)) {
    const id = rawLine.trim()
    if (id.length > 0) {
      models.push({ id, label: id })
    }
  }
  return uniqueModels(models)
}

function getPiModelTableFields(line: string, maxFields: number): string[] {
  const fields: string[] = []
  let tokenStart = -1
  for (let index = 0; index <= line.length; index++) {
    const isEnd = index === line.length
    if (!isEnd && !isPiModelTableWhitespace(line.charCodeAt(index))) {
      tokenStart = tokenStart === -1 ? index : tokenStart
      continue
    }
    if (tokenStart !== -1) {
      fields.push(line.slice(tokenStart, index))
      tokenStart = -1
      if (fields.length >= maxFields) {
        break
      }
    }
  }
  return fields
}

function isPiModelTableWhitespace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 160 ||
    code === 5760 ||
    (code >= 8192 && code <= 8202) ||
    code === 8232 ||
    code === 8233 ||
    code === 8239 ||
    code === 8287 ||
    code === 12288 ||
    code === 65279
  )
}
