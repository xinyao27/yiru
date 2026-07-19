import type { AiVaultAgent, AiVaultScanIssue } from '../../shared/ai-vault-types'
import { discoverFiles, type SessionFileDiscoveryBudget } from './session-scanner-discovery'
import {
  claudeProjectsRootDirs,
  codexSessionRootDirs,
  normalizeAiVaultWslHomeDirs
} from './session-scanner-source-discovery'
import { SUBAGENT_DIR_NAME } from './session-scanner-subagent-transcripts'
import type { AiVaultScanOptions, SessionFileDiscovery } from './session-scanner-types'

export const SPOOL_SESSION_INVENTORY_MAX_CANDIDATES = 50_000
export const SPOOL_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES = 100_000
export const SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES = 64 * 1024 * 1024

type InventoryRoot = {
  agent: Extract<AiVaultAgent, 'claude' | 'codex'>
  rootDir: string
}

export async function discoverSpoolSessionInventorySources(args: {
  options: AiVaultScanOptions
  issues: AiVaultScanIssue[]
  claudeProjectsDirs?: readonly string[]
  codexSessionDirs?: readonly string[]
  signal?: AbortSignal
}): Promise<SessionFileDiscovery[]> {
  const wslHomeDirs = normalizeAiVaultWslHomeDirs(args.options.wslHomeDirs)
  const roots: InventoryRoot[] = [
    ...(
      args.claudeProjectsDirs ??
      claudeProjectsRootDirs({
        claudeProjectsDir: args.options.claudeProjectsDir,
        wslHomeDirs
      })
    ).map((rootDir) => ({ agent: 'claude' as const, rootDir })),
    ...(args.codexSessionDirs ?? codexSessionRootDirs(args.options, wslHomeDirs)).map(
      (rootDir) => ({
        agent: 'codex' as const,
        rootDir
      })
    )
  ]
  const discoveries: SessionFileDiscovery[] = []
  const budget: SessionFileDiscoveryBudget = { entries: 0, candidates: 0, pathBytes: 0 }

  // Why: exhaustive means fail closed at the resource ceiling, never slice a complete-looking prefix.
  for (const root of roots) {
    const discovery = await discoverFiles({
      rootDir: root.rootDir,
      limit: null,
      agent: root.agent,
      issues: args.issues,
      extensions: ['.jsonl'],
      ...(root.agent === 'claude'
        ? { directoryPredicate: (name: string) => name !== SUBAGENT_DIR_NAME }
        : {}),
      readErrorPolicy: 'throw-except-missing',
      maxEntries: SPOOL_SESSION_INVENTORY_MAX_TRAVERSAL_ENTRIES,
      maxCandidates: SPOOL_SESSION_INVENTORY_MAX_CANDIDATES,
      maxPathBytes: SPOOL_SESSION_INVENTORY_MAX_PATH_BYTES,
      budget,
      signal: args.signal
    })
    discoveries.push(discovery)
  }
  return discoveries
}
