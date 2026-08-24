import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import type { ClaudeUsageProcessedFile } from './types'

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const CLAUDE_TRANSCRIPTS_DIR = join(homedir(), '.claude', 'transcripts')

export async function listClaudeTranscriptFiles(): Promise<string[]> {
  const roots = [CLAUDE_PROJECTS_DIR, CLAUDE_TRANSCRIPTS_DIR]
  const files = await Promise.all(
    roots.map(async (root) => {
      try {
        return await walkJsonlFiles(root)
      } catch {
        return []
      }
    })
  )
  return [...new Set(files.flat())].sort()
}

export async function getProcessedFileInfo(filePath: string): Promise<ClaudeUsageProcessedFile> {
  const fileStat = await stat(filePath)
  let lineCount = 0
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })
  for await (const _line of lines) {
    lineCount++
  }
  return {
    path: filePath,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size,
    lineCount
  }
}

export async function getProcessedFileStat(
  filePath: string
): Promise<Omit<ClaudeUsageProcessedFile, 'lineCount'>> {
  const fileStat = await stat(filePath)
  return { path: filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size }
}

async function walkJsonlFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      for (const childPath of await walkJsonlFiles(fullPath)) {
        files.push(childPath)
      }
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath)
    }
  }
  return files
}
