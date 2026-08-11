import { parse } from 'yaml'

import type { YiruDefaultTabTemplate, YiruHooks } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const DEFAULT_TAB_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/
const MAX_SHARED_DIRECTORIES = 100

function normalizeSharedDirectories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  for (const entry of value.slice(0, MAX_SHARED_DIRECTORIES)) {
    const raw = asTrimmedString(entry)
    if (!raw) {
      continue
    }
    const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
    const segments = normalized.split('/')
    if (
      !normalized ||
      normalized.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalized) ||
      segments.includes('..') ||
      segments.includes('.') ||
      segments.includes('') ||
      segments.includes('.git')
    ) {
      continue
    }
    seen.add(normalized)
  }
  return Array.from(seen)
}

function normalizeDefaultTabs(value: unknown): YiruDefaultTabTemplate[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }
      const title = asTrimmedString(record.title)
      const command = asTrimmedString(record.command)
      const color = asTrimmedString(record.color)
      const normalizedColor = color && DEFAULT_TAB_COLOR_RE.test(color) ? color : undefined
      if (!title && !command && !normalizedColor) {
        return null
      }
      return {
        ...(title ? { title } : {}),
        ...(normalizedColor ? { color: normalizedColor } : {}),
        ...(command ? { command } : {})
      }
    })
    .filter((entry): entry is YiruDefaultTabTemplate => entry !== null)
}

/**
 * Parse the supported project defaults from `yiru.yaml`.
 */
export function parseYiruYaml(content: string): YiruHooks | null {
  let root: unknown
  try {
    root = parse(content)
  } catch {
    return null
  }

  const record = asRecord(root)
  if (!record) {
    return null
  }

  const scriptsRecord = asRecord(record.scripts)
  const setup = scriptsRecord ? asTrimmedString(scriptsRecord.setup) : undefined
  const archive = scriptsRecord ? asTrimmedString(scriptsRecord.archive) : undefined
  const defaultTabs = normalizeDefaultTabs(record.defaultTabs)
  const worktreeRecord = asRecord(record.worktree)
  const sharedDirectories = worktreeRecord
    ? normalizeSharedDirectories(worktreeRecord.sharedDirectories)
    : []

  if (!setup && !archive && defaultTabs.length === 0 && sharedDirectories.length === 0) {
    return null
  }

  return {
    scripts: {
      ...(setup ? { setup } : {}),
      ...(archive ? { archive } : {})
    },
    ...(defaultTabs.length > 0 ? { defaultTabs } : {}),
    ...(sharedDirectories.length > 0 ? { worktree: { sharedDirectories } } : {})
  }
}
