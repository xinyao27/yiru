import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  getEndpointFileName,
  seedClaudeSubagentRosterFromSnapshots,
  seedCodexStateFromSnapshot,
  writeEndpointFile
} from '~shared/agent/hook-listener'
import { YIRU_HOOK_PROTOCOL_VERSION } from '~shared/agent/hook-types'

import type { EnrichedAgentHookEventPayload, LastStatusFile } from './agent-hook-server-foundation'
import {
  LAST_STATUS_FILE_NAME,
  LAST_STATUS_FILE_VERSION,
  STATUS_PERSIST_DEBOUNCE_MS,
  HYDRATE_MAX_AGE_MS,
  isValidPaneKey,
  dropHydratedIdleClaudeSubagents,
  sanitizeHydratedEntry
} from './agent-hook-server-foundation'
import { AgentHookServerLayer6 } from './agent-hook-server-layer-6'

export class AgentHookServer extends AgentHookServerLayer6 {
  buildPtyEnv(): Record<string, string> {
    if (Object.keys(this.forwardedPtyEnv).length > 0) {
      return { ...this.forwardedPtyEnv }
    }
    if (this.port <= 0 || !this.token) {
      return {}
    }

    const env: Record<string, string> = {
      YIRU_AGENT_HOOK_PORT: String(this.port),
      YIRU_AGENT_HOOK_TOKEN: this.token,
      YIRU_AGENT_HOOK_ENV: this.env,
      YIRU_AGENT_HOOK_VERSION: YIRU_HOOK_PROTOCOL_VERSION
    }
    // Why: managed hooks source this file at invocation time. Packaged builds
    // use a stable file for restart handoff; dev callers pass a per-instance
    // namespace so parallel `pnpm dev` runs do not steal each other's hooks.
    if (this.endpointFileWritten && this.endpointFilePathCache) {
      env.YIRU_AGENT_HOOK_ENDPOINT = this.endpointFilePathCache
    }
    return env
  }

  get endpointFilePath(): string | null {
    return this.endpointFilePathCache
  }

  protected configureHostState(options?: {
    env?: string
    userDataPath?: string
    endpointNamespace?: string
  }): void {
    if (options?.env) {
      this.env = options.env
    }
    if (options?.userDataPath) {
      // Why: dev builds share one userData path, so callers can namespace the
      // endpoint file while packaged builds keep a stable restart handoff.
      this.endpointDir = options.endpointNamespace
        ? join(options.userDataPath, 'agent-hooks', options.endpointNamespace)
        : join(options.userDataPath, 'agent-hooks')
      this.endpointFilePathCache = join(this.endpointDir, getEndpointFileName())
      this.lastStatusFilePath = join(this.endpointDir, LAST_STATUS_FILE_NAME)
    }
    if (this.lastStatusFilePath && !this.statusHydrated) {
      this.hydrateLastStatusFromDisk()
      this.statusHydrated = true
    }
  }

  /** Test/diagnostic accessor for the on-disk last-status file path. */
  get lastStatusPath(): string | null {
    return this.lastStatusFilePath
  }

  protected maybeWriteEndpointFile(): void {
    if (!this.endpointDir || !this.endpointFilePathCache) {
      return
    }
    this.endpointFileWritten = false
    const ok = writeEndpointFile(this.endpointDir, this.endpointFilePathCache, {
      port: this.port,
      token: this.token,
      env: this.env,
      version: YIRU_HOOK_PROTOCOL_VERSION
    })
    this.endpointFileWritten = ok
  }

  protected hydrateLastStatusFromDisk(): void {
    if (!this.lastStatusFilePath) {
      return
    }
    // Why: defensive — keeps hydrate idempotent against repeated start()
    // calls; production callers always have an empty map here, but a future
    // re-start path must not silently merge prior-session state.
    this.state.lastStatusByPaneKey.clear()
    let raw: string
    try {
      raw = readFileSync(this.lastStatusFilePath, 'utf8')
    } catch (err) {
      // Why: missing file is the common case (first launch).
      // Other errors (EACCES, etc.) degrade to empty hydration with a single
      // warn so the dashboard renders normally.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[agent-hooks] failed to read last-status file:', err)
      }
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn('[agent-hooks] last-status file is not valid JSON; ignoring')
      return
    }
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[agent-hooks] last-status file is not an object; ignoring')
      return
    }
    const file = parsed as Partial<LastStatusFile>
    if (file.version !== LAST_STATUS_FILE_VERSION) {
      console.warn(
        `[agent-hooks] last-status file version mismatch (${String(
          file.version
        )} != ${LAST_STATUS_FILE_VERSION}); ignoring`
      )
      return
    }
    const entries = file.entries
    if (typeof entries !== 'object' || entries === null) {
      console.warn('[agent-hooks] last-status file entries missing or wrong shape; ignoring')
      return
    }
    let hydrated = 0
    let dropped = 0
    let prunedLegacyClaudeSubagents = 0
    // Why: bound disk growth — drop anything older than HYDRATE_MAX_AGE_MS so
    // entries from worktrees archived weeks ago do not pile up forever. Use
    // Date.now() once to keep the cutoff consistent across all entries this
    // tick.
    const ttlCutoff = Date.now() - HYDRATE_MAX_AGE_MS
    for (const [paneKey, rawEntry] of Object.entries(entries)) {
      const resolvedPaneKey = this.resolvePaneKeyAlias(paneKey)
      const rawResolvedEntry =
        resolvedPaneKey === paneKey || typeof rawEntry !== 'object' || rawEntry === null
          ? rawEntry
          : { ...(rawEntry as Record<string, unknown>), paneKey: resolvedPaneKey }
      const entry = sanitizeHydratedEntry(resolvedPaneKey, rawResolvedEntry)
      if (entry && entry.receivedAt >= ttlCutoff) {
        const hydratedPayload = dropHydratedIdleClaudeSubagents(entry.payload)
        if (hydratedPayload !== entry.payload) {
          prunedLegacyClaudeSubagents +=
            (entry.payload.subagents?.length ?? 0) - (hydratedPayload.subagents?.length ?? 0)
          entry.payload = hydratedPayload
        }
        this.state.lastStatusByPaneKey.set(resolvedPaneKey, entry)
        // Why: restore live child hierarchy immediately; provider-specific reconciliation reaps stale seeds.
        if (entry.payload.agentType === 'codex') {
          seedCodexStateFromSnapshot(this.state, resolvedPaneKey, entry.payload)
        } else if (entry.payload.agentType === 'claude' && entry.payload.subagents) {
          seedClaudeSubagentRosterFromSnapshots(
            this.state,
            resolvedPaneKey,
            entry.payload.subagents
          )
        }
        hydrated += 1
      } else {
        dropped += 1
      }
    }
    if (dropped > 0) {
      console.warn(
        `[agent-hooks] last-status hydrate dropped ${dropped} entries (kept ${hydrated})`
      )
    }
    if (dropped > 0 || prunedLegacyClaudeSubagents > 0) {
      // Why: persist load-time pruning once so legacy idle rows do not consume
      // parse/filter work again on every launch.
      this.runStatusPersist()
    } else if (hydrated > 0) {
      // Why: prime from the raw on-disk bytes (not a re-serialization) so the
      // dedup is robust against future shape drift in serializeStatusFile.
      // Only prime when hydration was lossless — if entries were dropped
      // during sanitize, the in-memory map diverges from the on-disk bytes.
      this.lastWrittenJson = raw
    }
  }

  protected serializeStatusFile(): string {
    const entries: Record<string, EnrichedAgentHookEventPayload> = {}
    for (const [paneKey, payload] of this.state.lastStatusByPaneKey) {
      // Why: defensive — never persist invalid keys even if they slipped
      // into the in-memory map somehow. Same invariant the hydrate path
      // enforces.
      if (!isValidPaneKey(paneKey)) {
        continue
      }
      const { promptInteractionKey: _promptInteractionKey, ...persistedPayload } = payload
      entries[paneKey] = persistedPayload as EnrichedAgentHookEventPayload
    }
    const file: LastStatusFile = { version: LAST_STATUS_FILE_VERSION, entries }
    return JSON.stringify(file)
  }

  protected scheduleStatusPersist(): void {
    if (!this.lastStatusFilePath) {
      return
    }
    // Why: each call resets the timer; the disk write fires
    // STATUS_PERSIST_DEBOUNCE_MS after the LAST event in the burst.
    if (this.statusPersistTimer) {
      clearTimeout(this.statusPersistTimer)
    }
    this.statusPersistTimer = setTimeout(() => {
      this.statusPersistTimer = null
      this.runStatusPersist()
    }, STATUS_PERSIST_DEBOUNCE_MS)
    // Why: don't keep the event loop alive just for a status flush — quit
    // already triggers flushStatusPersistSync(). On Node 12+ unref() is a
    // no-op when called on an already-unref'd timer.
    if (typeof this.statusPersistTimer.unref === 'function') {
      this.statusPersistTimer.unref()
    }
  }

  flushStatusPersistSync(): void {
    if (this.statusPersistTimer) {
      clearTimeout(this.statusPersistTimer)
      this.statusPersistTimer = null
    }
    if (!this.lastStatusFilePath) {
      return
    }
    this.runStatusPersist()
  }

  protected runStatusPersist(): void {
    if (!this.lastStatusFilePath || !this.endpointDir) {
      return
    }
    const json = this.serializeStatusFile()
    if (json === this.lastWrittenJson) {
      return
    }
    const tmpPath = join(this.endpointDir, `.last-status-${process.pid}-${randomUUID()}.tmp`)
    let tmpWritten = false
    try {
      mkdirSync(this.endpointDir, { recursive: true, mode: 0o700 })
      if (process.platform !== 'win32') {
        try {
          chmodSync(this.endpointDir, 0o700)
        } catch {
          // best-effort
        }
      }
      writeFileSync(tmpPath, json, { mode: 0o600 })
      tmpWritten = true
      renameSync(tmpPath, this.lastStatusFilePath)
      this.lastWrittenJson = json
    } catch (err) {
      console.warn('[agent-hooks] failed to write last-status file:', err)
      if (tmpWritten) {
        try {
          unlinkSync(tmpPath)
        } catch {
          // tmp already gone
        }
      }
    }
  }
}
