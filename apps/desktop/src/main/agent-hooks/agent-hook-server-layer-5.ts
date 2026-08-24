import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { normalizeAgentProviderSession } from '@yiru/workbench-model/agent'
import { normalizeAgentStatusPayload } from '@yiru/workbench-model/agent'
import {
  HOOK_REQUEST_SLOWLORIS_MS,
  MAX_PANE_KEY_LEN,
  normalizeHookPayload,
  readRequestBody,
  resolveHookSource,
  warnOnHookEnvOrVersionMismatch,
  type AgentHookEventPayload
} from '~shared/agent/hook-listener'
import { parsePaneKey } from '~shared/stable-pane-id'

import { track } from '../telemetry/client'
import { isValidPiProviderSessionOnly } from './agent-hook-server-foundation'
import { AgentHookServerLayer4 } from './agent-hook-server-layer-4'
import { trackEmptyPaneKeyHook } from './agent-hook-status-normalization'

export abstract class AgentHookServerLayer5 extends AgentHookServerLayer4 {
  /** Ingest a payload that arrived over the relay JSON-RPC channel rather
   *  than the local HTTP server. `connectionId` is the ChannelMultiplexer
   *  identity Yiru holds (the wire envelope carries connectionId: null and
   *  Yiru stamps the real value here). The relay has already normalized the
   *  payload via the shared listener module, but main is still the SSH trust
   *  boundary: re-run the canonical status normalizer before caching or
   *  persisting anything. The `env`/`version` fields are forwarded verbatim
   *  from the agent CLI's POST body on the remote and validated here so the
   *  warn-once diagnostics fire for real cross-build mismatches. */
  ingestRemote(
    envelope: {
      paneKey: string
      tabId?: string
      worktreeId?: string
      env?: string
      version?: string
      launchToken?: string
      hasExplicitPrompt?: boolean
      promptInteractionKey?: string
      hookEventName?: string
      toolUseId?: string
      toolAgentId?: string
      toolAgentType?: string
      providerSession?: unknown
      providerSessionOnly?: unknown
      isReplay?: boolean
      payload: unknown
    },
    connectionId: string | null
  ): void {
    // Why: signature says non-empty, but the wire crosses a trust boundary —
    // re-check at runtime (and trim) so a whitespace-only or empty
    // connectionId can't poison caches.
    const trimmedConnectionId = connectionId?.trim()
    if (connectionId !== null && (!trimmedConnectionId || trimmedConnectionId.length === 0)) {
      return
    }
    if (!envelope || typeof envelope.paneKey !== 'string') {
      return
    }
    // Why: match the listener's HTTP path — `normalizeHookPayload` trims and
    // length-caps paneKey before caching, so the cache key here must follow
    // the same rule or remote-vs-local events for the same pane would diverge.
    const physicalPaneKey = envelope.paneKey.trim()
    const paneKey = this.resolvePaneKeyAlias(physicalPaneKey)
    const parsedPaneKey = parsePaneKey(paneKey)
    if (paneKey.length === 0) {
      track('agent_hook_unattributed', { reason: 'empty_pane_key' })
      return
    }
    if (paneKey.length > MAX_PANE_KEY_LEN) {
      return
    }
    if (!parsedPaneKey) {
      return
    }
    if (envelope.tabId !== undefined && typeof envelope.tabId !== 'string') {
      return
    }
    if (envelope.worktreeId !== undefined && typeof envelope.worktreeId !== 'string') {
      return
    }
    // Why: mirror the HTTP path's `readStringField` behavior — trim and treat
    // empty-after-trim as undefined rather than letting a literal "" leak
    // into the event.
    const reportedTabId =
      envelope.tabId !== undefined && envelope.tabId.trim().length > 0
        ? envelope.tabId.trim()
        : undefined
    if (
      paneKey === physicalPaneKey &&
      reportedTabId !== undefined &&
      reportedTabId !== parsedPaneKey.tabId
    ) {
      return
    }
    const tabId = paneKey !== physicalPaneKey ? parsedPaneKey.tabId : reportedTabId
    if (this.shouldSuppressClosedTabStatus(paneKey)) {
      return
    }
    const worktreeId =
      envelope.worktreeId !== undefined && envelope.worktreeId.trim().length > 0
        ? envelope.worktreeId.trim()
        : undefined
    const hookEventName =
      typeof envelope.hookEventName === 'string' && envelope.hookEventName.trim().length > 0
        ? envelope.hookEventName.trim()
        : undefined
    const promptInteractionKey =
      typeof envelope.promptInteractionKey === 'string' &&
      envelope.promptInteractionKey.trim().length > 0
        ? envelope.promptInteractionKey.trim()
        : undefined
    const toolUseId =
      typeof envelope.toolUseId === 'string' && envelope.toolUseId.trim().length > 0
        ? envelope.toolUseId.trim()
        : undefined
    const toolAgentId =
      typeof envelope.toolAgentId === 'string' && envelope.toolAgentId.trim().length > 0
        ? envelope.toolAgentId.trim()
        : undefined
    const toolAgentType =
      typeof envelope.toolAgentType === 'string' && envelope.toolAgentType.trim().length > 0
        ? envelope.toolAgentType.trim()
        : undefined
    const providerSession = normalizeAgentProviderSession(envelope.providerSession) ?? undefined
    // Why: the relay is across a trust boundary; re-run the canonical
    // normalizer on the inner payload so prompt/agentType/toolName/toolInput
    // length caps, embedded-newline collapse, and the `interrupted`-only-on-
    // done invariant are enforced here too. Returns null on malformed input
    // (including invalid state), which subsumes the prior explicit state
    // check.
    const normalizedPayload = normalizeAgentStatusPayload(envelope.payload)
    if (!normalizedPayload) {
      return
    }
    if (
      envelope.providerSessionOnly === true &&
      !isValidPiProviderSessionOnly(providerSession, normalizedPayload.agentType)
    ) {
      return
    }
    // Why: run the same warn-once diagnostics the HTTP path runs (cross-build
    // version mismatch, dev-vs-prod env mismatch). Use `this.env` as the
    // expected env so the messages match what the local server produces.
    warnOnHookEnvOrVersionMismatch(this.state, {
      version: envelope.version,
      env: envelope.env,
      expectedEnv: this.env
    })
    const event: AgentHookEventPayload = {
      paneKey,
      launchToken: envelope.launchToken,
      tabId,
      worktreeId,
      connectionId: trimmedConnectionId ?? null,
      hasExplicitPrompt: envelope.hasExplicitPrompt === true ? true : undefined,
      promptInteractionKey,
      hookEventName,
      toolUseId,
      toolAgentId,
      toolAgentType,
      providerSession,
      providerSessionOnly: envelope.providerSessionOnly === true ? true : undefined,
      isReplay: envelope.isReplay === true ? true : undefined,
      payload: normalizedPayload
    }
    this.applyNormalizedStatus(event)
  }

  async start(options?: {
    env?: string
    userDataPath?: string
    endpointNamespace?: string
  }): Promise<void> {
    if (this.server) {
      return
    }

    this.configureHostState(options)
    this.token = randomUUID()
    this.endpointFileWritten = false
    this.lastWrittenJson = null
    // Why: hydrate before binding the HTTP listener so any new hook POST
    // (which goes through state.lastStatusByPaneKey.set) runs against an
    // already-populated map. The renderer later pulls this map as a snapshot
    // after workspace tabs are hydrated.
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(404)
        res.end()
        return
      }

      if (req.headers['x-yiru-agent-hook-token'] !== this.token) {
        res.writeHead(403)
        res.end()
        return
      }

      // Why: bound request time so a slow/stalled client cannot hold a socket
      // open indefinitely (slowloris-style). The hook endpoints are local and
      // should complete in well under a second.
      req.setTimeout(HOOK_REQUEST_SLOWLORIS_MS, () => {
        req.destroy()
      })

      try {
        const body = await readRequestBody(req)
        const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
        const source = resolveHookSource(pathname)
        if (!source) {
          res.writeHead(404)
          res.end()
          return
        }

        trackEmptyPaneKeyHook(body)
        const aliasedBody = this.normalizeHookBodyPaneKeyAlias(body)
        const normalized = normalizeHookPayload(this.state, source, aliasedBody, this.env)
        if (normalized && !this.shouldSuppressClosedTabStatus(normalized.paneKey)) {
          const enriched = this.applyNormalizedStatus(normalized)
          this.scheduleAssistantMessageRetry(source, aliasedBody, enriched)
        }

        res.writeHead(204)
        res.end()
      } catch {
        // Why: agent hooks must fail open. The receiver returns success for
        // malformed payloads so a newer or broken hook never blocks the agent.
        res.writeHead(204)
        res.end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      // Why: swap the startup error handler on success so a later runtime
      // error (e.g. EADDRINUSE during rebind, socket errors) doesn't reject
      // an already-settled promise or crash the main process as unhandled.
      const onStartupError = (err: Error): void => {
        this.server?.off('listening', onListening)
        reject(err)
      }
      const onListening = (): void => {
        this.server?.off('error', onStartupError)
        this.server?.on('error', (err) => {
          console.error('[agent-hooks] server error', err)
        })
        const address = this.server!.address()
        if (address && typeof address === 'object') {
          this.port = address.port
        }
        this.maybeWriteEndpointFile()
        resolve()
      }
      this.server!.once('error', onStartupError)
      this.server!.listen(0, '127.0.0.1', onListening)
    })
  }
}
