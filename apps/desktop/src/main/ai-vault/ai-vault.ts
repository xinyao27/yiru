import { resolve } from 'node:path'

import type {
  AiVaultListArgs,
  AiVaultListResult,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/workbench-model/agent'
import { isPathInsideOrEqual } from '@yiru/workbench-model/platform'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostScope,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId,
  type ExecutionHostScope
} from '@yiru/workbench-model/workspace'

import {
  configureAiVaultSessionSources,
  getAiVaultWslHomeDirs,
  listAiVaultSessions as listCachedLocalAiVaultSessions,
  type AiVaultSessionSources
} from './cached-session-list'
import { aiVaultScanIssueResult, mergeAiVaultListResults } from './session/list-results'
import { listClaudeSubagentSessions } from './session/scanner-claude-subagents'
import { claudeProjectsRootDirs } from './session/scanner-source-discovery'

const AI_VAULT_CACHE_TTL_MS = 15_000
const AI_VAULT_ALL_HOST_RUNTIME_TIMEOUT_MS = 3_000

export type AiVaultHandlerOptions = AiVaultSessionSources & {
  // Why: hosts this process can no longer read transcripts from. The "all hosts"
  // merge must still name them, or their sessions disappear from the result with
  // no trace and the user reads it as "nothing was recorded on that machine".
  getUnscannableAiVaultHostIds?: () => readonly ExecutionHostId[]
  getActiveRuntimeAiVaultHostInfos?: () => readonly RuntimeAiVaultHostInfo[]
  scanRuntimeAiVaultSessions?: (
    environmentId: string,
    args: AiVaultListArgs,
    options?: RuntimeAiVaultScanOptions
  ) => Promise<AiVaultListResult>
}

type RuntimeAiVaultScanOptions = {
  timeoutMs?: number
}

type CachedAiVaultList = {
  key: string
  result: AiVaultListResult
  expiresAt: number
}

type RuntimeAiVaultHostInfo = {
  environmentId: string
  executionHostId: `runtime:${string}`
}

let cachedList: CachedAiVaultList | null = null
let inflightList: Promise<AiVaultListResult> | null = null
let inflightKey: string | null = null
let handlerOptions: AiVaultHandlerOptions = {}

export async function listAiVaultSessions(args?: AiVaultListArgs): Promise<AiVaultListResult> {
  const executionHostScope = normalizeExecutionHostScope(
    args?.executionHostScope ?? LOCAL_EXECUTION_HOST_ID
  )
  // Why: local-scope scans go straight to the shared cache module (also used by
  // the runtime RPC method), so the desktop panel and a paired mobile client
  // never double-scan the same transcripts; the cache below only has to dedupe
  // the multi-host (runtime/all) merges that exist on the desktop side.
  if (executionHostScope === LOCAL_EXECUTION_HOST_ID) {
    return scanLocalAiVaultSessions(args)
  }
  // Scope paths change the result set, so they must be part of the cache key.
  const key = JSON.stringify({
    limit: args?.limit ?? 'default',
    scopePaths: args?.scopePaths ?? [],
    executionHostScope
  })
  const now = Date.now()
  // Why: opening this panel repeatedly should not re-parse hundreds of JSONL
  // transcripts; explicit refreshes bypass the cache but not an active scan.
  if (args?.force !== true && cachedList?.key === key && cachedList.expiresAt > now) {
    return cachedList.result
  }
  if (inflightList && inflightKey === key) {
    return inflightList
  }

  inflightKey = key
  inflightList = scanAiVaultSessionsByHostScope(args, executionHostScope)
    .then((result) => {
      cachedList = {
        key,
        result,
        expiresAt: Date.now() + AI_VAULT_CACHE_TTL_MS
      }
      return result
    })
    .finally(() => {
      // Only clear tracking if it still refers to this request: a concurrent
      // different-scope scan may have replaced it and must stay dedupable.
      if (inflightKey === key) {
        inflightKey = null
        inflightList = null
      }
    })
  return inflightList
}

async function scanAiVaultSessionsByHostScope(
  args: AiVaultListArgs | undefined,
  executionHostScope: ExecutionHostScope
): Promise<AiVaultListResult> {
  if (executionHostScope === 'all') {
    const runtimeHosts = getActiveRuntimeAiVaultHostInfosResult()
    const runtimeResults = runtimeHosts.issue ? [runtimeHosts.issue] : []
    return mergeAiVaultListResults(
      await Promise.all([
        scanLocalAiVaultSessions(args),
        ...runtimeHosts.hostInfos.map((hostInfo) =>
          scanRuntimeAiVaultSessions(hostInfo, args, {
            timeoutMs: AI_VAULT_ALL_HOST_RUNTIME_TIMEOUT_MS
          })
        ),
        ...runtimeResults,
        ...unscannableHostIssueResults()
      ]),
      args?.limit
    )
  }

  const parsed = parseExecutionHostId(executionHostScope)
  if (parsed?.kind === 'runtime') {
    return scanRuntimeAiVaultSessions(
      {
        environmentId: parsed.environmentId,
        executionHostId: toRuntimeExecutionHostId(parsed.environmentId)
      },
      args
    )
  }

  return aiVaultScanIssueResult({
    executionHostId: executionHostScope,
    path: executionHostScope,
    message: 'Agent Session History is not available for this execution host.'
  })
}

const UNSCANNABLE_AI_VAULT_HOST_MESSAGE =
  'Agent Session History is not available for this execution host, so its sessions are missing from this list.'

function unscannableHostIssueResults(): AiVaultListResult[] {
  return (handlerOptions.getUnscannableAiVaultHostIds?.() ?? []).map((executionHostId) =>
    aiVaultScanIssueResult({
      executionHostId,
      path: executionHostId,
      message: UNSCANNABLE_AI_VAULT_HOST_MESSAGE
    })
  )
}

function getActiveRuntimeAiVaultHostInfos(): readonly RuntimeAiVaultHostInfo[] {
  return handlerOptions.getActiveRuntimeAiVaultHostInfos?.() ?? []
}

function getActiveRuntimeAiVaultHostInfosResult(): {
  hostInfos: readonly RuntimeAiVaultHostInfo[]
  issue?: AiVaultListResult
} {
  try {
    return { hostInfos: getActiveRuntimeAiVaultHostInfos() }
  } catch (error) {
    return {
      hostInfos: [],
      issue: runtimeHostDiscoveryIssueResult(
        error instanceof Error ? error.message : 'Runtime hosts are unavailable.'
      )
    }
  }
}

async function scanRuntimeAiVaultSessions(
  hostInfo: RuntimeAiVaultHostInfo,
  args?: AiVaultListArgs,
  options: RuntimeAiVaultScanOptions = {}
): Promise<AiVaultListResult> {
  const scanner = handlerOptions.scanRuntimeAiVaultSessions
  if (!scanner) {
    return runtimeScanIssueResult(
      hostInfo,
      'Agent Session History is not available for this execution host.'
    )
  }
  const scanArgs: AiVaultListArgs = { executionHostScope: hostInfo.executionHostId }
  if (args?.limit !== undefined) {
    scanArgs.limit = args.limit
  }
  if (args?.force !== undefined) {
    scanArgs.force = args.force
  }
  if (args?.scopePaths !== undefined) {
    scanArgs.scopePaths = args.scopePaths
  }
  try {
    return await scanner(hostInfo.environmentId, scanArgs, options)
  } catch (error) {
    return runtimeScanIssueResult(
      hostInfo,
      error instanceof Error ? error.message : 'Runtime host is unavailable.'
    )
  }
}

function runtimeScanIssueResult(
  hostInfo: RuntimeAiVaultHostInfo,
  message: string
): AiVaultListResult {
  return aiVaultScanIssueResult({
    executionHostId: hostInfo.executionHostId,
    path: hostInfo.environmentId,
    message
  })
}

function runtimeHostDiscoveryIssueResult(message: string): AiVaultListResult {
  return aiVaultScanIssueResult({ path: 'runtime environments', message })
}

async function scanLocalAiVaultSessions(args?: AiVaultListArgs): Promise<AiVaultListResult> {
  // Why: the shared cache module owns codex-home/WSL sourcing and the local
  // scan cache, so the desktop IPC path and the runtime RPC method (mobile)
  // share one cache instance and one source of managed-Codex homes.
  return listCachedLocalAiVaultSessions({
    limit: args?.limit,
    force: args?.force,
    scopePaths: args?.scopePaths
  })
}

export function configureAiVaultHandlers(options: AiVaultHandlerOptions = {}): void {
  handlerOptions = options
  // Why: configure the SAME shared cache module the runtime RPC method uses so
  // there is exactly one cache instance and neither caller drops codex-home or
  // WSL injection. The runtime also configures these sources from its deps
  // (serve-mode reachable); this desktop path supplies the same source.
  configureAiVaultSessionSources(options)
}

// Provider-gated: only Claude materializes Task subagent transcripts as
// sibling files today; other agents resolve to an empty list.
export async function listAiVaultSubagentSessions(
  args?: AiVaultSubagentListArgs
): Promise<AiVaultSubagentListResult> {
  // IPC payloads are untyped at runtime; malformed input resolves empty like
  // every other rejected input instead of throwing.
  if (
    !args ||
    args.agent !== 'claude' ||
    typeof args.parentFilePath !== 'string' ||
    !args.parentFilePath.trim()
  ) {
    return { sessions: [], issues: [] }
  }
  // Why: subagent transcripts are read from the local filesystem. The UI
  // skips remote sessions (their transcripts live on the remote host); return
  // empty defensively rather than reading local paths for a remote session.
  const executionHostId = args.executionHostId ?? LOCAL_EXECUTION_HOST_ID
  if (executionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return { sessions: [], issues: [] }
  }
  // Why: the path is renderer-supplied; only list files under a known Claude
  // projects root so a crafted path can't readdir/preview arbitrary dirs.
  // resolve() collapses `..` segments first — isPathInsideOrEqual compares
  // textually and would otherwise pass `<root>/../../etc/x.jsonl`.
  const parentFilePath = resolve(args.parentFilePath)
  const roots = claudeProjectsRootDirs({ wslHomeDirs: await getAiVaultWslHomeDirs() })
  if (!roots.some((root) => isPathInsideOrEqual(resolve(root), parentFilePath))) {
    return { sessions: [], issues: [] }
  }
  return listClaudeSubagentSessions({ parentFilePath })
}
