import { opendir, stat } from 'node:fs/promises'
import { basename, delimiter, extname, join } from 'node:path'

import type { AiVaultAgent, AiVaultScanIssue } from '@yiru/workbench-model/agent'

import type { FileWithMtime, SessionFileDiscovery } from './session-scanner-types'
import { errorMessage } from './session-scanner-values'

export type SessionFileDiscoveryBudget = {
  entries: number
  candidates: number
  pathBytes: number
}

export async function discoverFiles(args: {
  rootDir: string
  limit: number | null
  agent: AiVaultAgent
  issues: AiVaultScanIssue[]
  extensions: string[]
  filePredicate?: (path: string) => boolean
  directoryPredicate?: (name: string, depth: number) => boolean
  readErrorPolicy?: 'collect' | 'throw-except-missing'
  maxEntries?: number
  maxCandidates?: number
  maxPathBytes?: number
  budget?: SessionFileDiscoveryBudget
  signal?: AbortSignal
}): Promise<SessionFileDiscovery> {
  const paths = await walkSessionFiles(args.rootDir, args.agent, args.issues, {
    extensions: new Set(args.extensions),
    filePredicate: args.filePredicate,
    directoryPredicate: args.directoryPredicate,
    readErrorPolicy: args.readErrorPolicy,
    maxEntries: args.maxEntries,
    maxCandidates: args.maxCandidates,
    maxPathBytes: args.maxPathBytes,
    budget: args.budget,
    signal: args.signal
  })
  const files: FileWithMtime[] = []
  for (const path of paths) {
    args.signal?.throwIfAborted()
    try {
      const fileStat = await stat(path)
      args.signal?.throwIfAborted()
      files.push({
        path,
        mtimeMs: fileStat.mtimeMs,
        modifiedAt: fileStat.mtime.toISOString(),
        sizeBytes: fileStat.size
      })
    } catch (err) {
      if (args.readErrorPolicy === 'throw-except-missing' && !isMissingPathError(err)) {
        throw err
      }
      args.issues.push({ agent: args.agent, path, message: errorMessage(err) })
    }
  }
  const sortedFiles = files.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return {
    agent: args.agent,
    rootDir: args.rootDir,
    files: args.limit === null ? sortedFiles : sortedFiles.slice(0, args.limit)
  }
}

export async function discoverOpenClawFiles(args: {
  rootDirs: string[]
  limit: number
  issues: AiVaultScanIssue[]
}): Promise<SessionFileDiscovery> {
  const discoveries = await Promise.all(
    args.rootDirs.map((rootDir) =>
      discoverFiles({
        rootDir: basename(rootDir) === 'agents' ? rootDir : join(rootDir, 'agents'),
        limit: args.limit,
        agent: 'openclaw',
        issues: args.issues,
        extensions: ['.jsonl'],
        filePredicate: (path) => path.split(/[\\/]/).includes('sessions')
      })
    )
  )
  const files = discoveries
    .flatMap((discovery) => discovery.files)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, args.limit)
  return { agent: 'openclaw', rootDir: args.rootDirs.join(delimiter), files }
}

export async function walkSessionFiles(
  dirPath: string,
  agent: AiVaultAgent,
  issues: AiVaultScanIssue[],
  options: {
    extensions: Set<string>
    filePredicate?: (path: string) => boolean
    // Return false to skip descending into a directory; depth 0 is a child of
    // rootDir, so pruned subtrees are never stat'd or parsed.
    directoryPredicate?: (name: string, depth: number) => boolean
    readErrorPolicy?: 'collect' | 'throw-except-missing'
    maxEntries?: number
    maxCandidates?: number
    maxPathBytes?: number
    budget?: SessionFileDiscoveryBudget
    signal?: AbortSignal
  },
  depth = 0
): Promise<string[]> {
  options.budget ??= { entries: 0, candidates: 0, pathBytes: 0 }
  options.signal?.throwIfAborted()
  let directory
  try {
    directory = await opendir(dirPath)
  } catch (error) {
    // Why: a paged inventory must fail instead of presenting an unreadable
    // subtree as an authoritative end-of-list; missing roots remain optional.
    if (options.readErrorPolicy === 'throw-except-missing' && !isMissingPathError(error)) {
      throw error
    }
    return []
  }

  const files: string[] = []
  try {
    for await (const entry of directory) {
      options.signal?.throwIfAborted()
      const fullPath = join(dirPath, entry.name)
      consumeDiscoveryEntry(fullPath, options)
      if (entry.isDirectory()) {
        // Skip whole subtrees an agent never wants (e.g. subagent transcripts),
        // avoiding the readdir cost of descending into them.
        if (options.directoryPredicate?.(entry.name, depth) ?? true) {
          files.push(...(await walkSessionFiles(fullPath, agent, issues, options, depth + 1)))
        }
        continue
      }
      if (
        entry.isFile() &&
        options.extensions.has(extname(entry.name).toLowerCase()) &&
        (options.filePredicate?.(fullPath) ?? true)
      ) {
        consumeDiscoveryCandidate(options)
        files.push(fullPath)
      }
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw error
    }
    if (options.readErrorPolicy === 'throw-except-missing' && !isMissingPathError(error)) {
      throw error
    }
    return []
  }
  return files
}

export class SessionFileDiscoveryLimitError extends Error {
  constructor() {
    super('AI Vault session file discovery capacity exceeded')
    this.name = 'SessionFileDiscoveryLimitError'
  }
}

function consumeDiscoveryEntry(
  path: string,
  options: {
    maxEntries?: number
    maxCandidates?: number
    maxPathBytes?: number
    budget?: SessionFileDiscoveryBudget
  }
): void {
  const budget = options.budget ?? { entries: 0, candidates: 0, pathBytes: 0 }
  options.budget = budget
  budget.entries++
  budget.pathBytes += Buffer.byteLength(path, 'utf8')
  if (
    (options.maxEntries !== undefined && budget.entries > options.maxEntries) ||
    (options.maxPathBytes !== undefined && budget.pathBytes > options.maxPathBytes)
  ) {
    throw new SessionFileDiscoveryLimitError()
  }
}

function consumeDiscoveryCandidate(options: {
  maxCandidates?: number
  budget?: SessionFileDiscoveryBudget
}): void {
  const budget = options.budget ?? { entries: 0, candidates: 0, pathBytes: 0 }
  options.budget = budget
  budget.candidates++
  if (options.maxCandidates !== undefined && budget.candidates > options.maxCandidates) {
    throw new SessionFileDiscoveryLimitError()
  }
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
