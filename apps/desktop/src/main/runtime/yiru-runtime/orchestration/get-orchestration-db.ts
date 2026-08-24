import { join } from 'node:path'

import {
  BROWSER_HEADLESS_RUNTIME_CAPABILITY,
  BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY,
  EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY,
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_CAPABILITIES,
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeCapability
} from '@yiru/runtime-protocol/capabilities'
import { getRuntimeHostPathsProvider } from '~main/runtime/host/paths-provider'
import { OrchestrationDb } from '~main/runtime/orchestration/db'
import type { OrchestrationWorkerServer } from '~main/runtime/orchestration/environment-transport'
import { syncFederatedDispatch } from '~main/runtime/orchestration/federation-sync'
import { OrchestrationError } from '~main/runtime/orchestration/orchestration-error'
import type { RuntimeStatus } from '~shared/runtime-types'

import { RuntimeCoreGetLocalProvider } from '../core/get-local-provider'

export abstract class RuntimeOrchestrationGetOrchestrationDb extends RuntimeCoreGetLocalProvider {
  getOrchestrationDb(): OrchestrationDb {
    if (!this._orchestrationDb) {
      const dbPath = join(getRuntimeHostPathsProvider().userDataPath(), 'orchestration.db')
      this._orchestrationDb = new OrchestrationDb(dbPath)
    }
    return this._orchestrationDb
  }

  setOrchestrationDb(db: OrchestrationDb): void {
    this._orchestrationDb = db
  }

  getRuntimeId(): string {
    return this.runtimeId
  }

  resolveOrchestrationWorkerServer(selector: string): OrchestrationWorkerServer {
    if (!this.orchestrationEnvironmentTransport) {
      throw new OrchestrationError(
        'server_required',
        'Coworking orchestration is unavailable in this runtime host.'
      )
    }
    return this.orchestrationEnvironmentTransport.resolve(selector)
  }

  protected syncOrchestrationFederatedDispatch(dispatchId: string): Promise<void> {
    const current = this.orchestrationFederationSyncs.get(dispatchId)
    if (current) {
      return current
    }
    const sync = syncFederatedDispatch(this, dispatchId)
      .then(() => {
        this.orchestrationFederationWarnings.delete(dispatchId)
      })
      .catch((error: unknown) => {
        if (!this.orchestrationFederationWarnings.has(dispatchId)) {
          console.warn(`[orchestration] Federation sync failed for ${dispatchId}:`, error)
          this.orchestrationFederationWarnings.add(dispatchId)
        }
        throw error
      })
      .finally(() => {
        this.orchestrationFederationSyncs.delete(dispatchId)
      })
    this.orchestrationFederationSyncs.set(dispatchId, sync)
    return sync
  }

  ensureOrchestrationFederationRelay(runId?: string): void {
    if (!this.orchestrationEnvironmentTransport) {
      return
    }
    for (const dispatch of this.getOrchestrationDb().listActiveFederatedDispatches(runId)) {
      if (this.orchestrationFederationTimers.has(dispatch.dispatch_id)) {
        continue
      }
      const tick = (): void => {
        const worker = this.getOrchestrationDb().getWorkerDispatch(dispatch.dispatch_id)
        if (!worker || !['starting', 'ready', 'stopping'].includes(worker.state)) {
          const activeTimer = this.orchestrationFederationTimers.get(dispatch.dispatch_id)
          if (activeTimer) {
            clearInterval(activeTimer)
          }
          this.orchestrationFederationTimers.delete(dispatch.dispatch_id)
          this.orchestrationFederationWarnings.delete(dispatch.dispatch_id)
          return
        }
        void this.syncOrchestrationFederatedDispatch(dispatch.dispatch_id).catch(() => undefined)
      }
      const timer = setInterval(tick, 1_000)
      timer.unref?.()
      this.orchestrationFederationTimers.set(dispatch.dispatch_id, timer)
      tick()
    }
  }

  stopOrchestrationFederationRelay(): void {
    for (const timer of this.orchestrationFederationTimers.values()) {
      clearInterval(timer)
    }
    this.orchestrationFederationTimers.clear()
    this.orchestrationFederationWarnings.clear()
  }

  getStartedAt(): number {
    return this.startedAt
  }

  getStatus(): RuntimeStatus {
    // Why: browser panes need a backend that can create and stream a page. A
    // desktop renderer provides one via <webview>; a headless host provides one
    // via its configured backend. Either way the same browser.screencast.v1 path
    // works, so advertise it when either is present. browser.headless.v1
    // additionally tells clients this host owns browser pages with no renderer,
    // so they must not fall back to a local desktop browser tab.
    const hasRenderer = Boolean(this.getAvailableAuthoritativeWindow())
    const hasHeadlessBrowser = !hasRenderer && Boolean(this.browserBackend)
    const canBrowse = hasRenderer || hasHeadlessBrowser
    const capabilities: RuntimeCapability[] = RUNTIME_CAPABILITIES.filter(
      (capability) =>
        !this.disabledCapabilities.has(capability) &&
        (capability !== 'browser.screencast.v1' || canBrowse)
    )
    if (hasHeadlessBrowser && !this.disabledCapabilities.has(BROWSER_HEADLESS_RUNTIME_CAPABILITY)) {
      capabilities.push(BROWSER_HEADLESS_RUNTIME_CAPABILITY)
    }
    if (
      hasRenderer &&
      !this.disabledCapabilities.has(EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY)
    ) {
      // Why: opening VS Code is a desktop-host side effect unavailable to headless serve.
      capabilities.push(EXTERNAL_EDITOR_REMOTE_SSH_RUNTIME_CAPABILITY)
    }
    // Why: certificate proceed is owned by the browser-hosting process for both
    // desktop webviews and offscreen pages. Advertise whenever either backend
    // can host a page so remote clients can surface Proceed Anyway (Unsafe).
    if (canBrowse && !this.disabledCapabilities.has(BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY)) {
      capabilities.push(BROWSER_CERTIFICATE_TRUST_RUNTIME_CAPABILITY)
    }
    const graph = this.terminalSessions.getGraphState()
    return {
      runtimeId: this.runtimeId,
      rendererGraphEpoch: graph.rendererGraphEpoch,
      graphStatus: graph.graphStatus,
      authoritativeWindowId: graph.authoritativeWindowId,
      desktopWindowStatus: hasRenderer ? 'available' : this.getDesktopWindowStatusFn(),
      liveTabCount: graph.liveTabCount,
      liveLeafCount: graph.liveLeafCount,
      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
      // Why: headless yiru serve cannot create/stream BrowserViews, so clients
      // must not treat browser panes as supported just because runtime RPC is up.
      capabilities,
      hostPlatform: process.platform,
      terminalWindowsShell: this.store?.getSettings?.().terminalWindowsShell ?? null,
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleMobileVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
    }
  }

  // Why: scans the transcript-owning host's disk (correct by construction over
  // RPC because the target runtime scans its own disk). Delegates to the shared
  // cache so the desktop panel and the mobile screen never double-scan.
}
