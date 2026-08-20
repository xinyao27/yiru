import {
  handleTerminalGetAutoRestoreFit,
  handleTerminalGetDisplayMode,
  handleTerminalResizeForClient,
  handleTerminalRestoreFit,
  handleTerminalSetAutoRestoreFit,
  handleTerminalSetDisplayMode,
  handleTerminalUnsubscribe,
  handleTerminalUpdateViewport
} from '~main/runtime/rpc/methods/terminal-viewport-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: the display-mode/viewport half of `terminal` — split out for the same
// 300-line-cap reason as terminal-read.ts. `updateViewport`/`unsubscribe` are wired here
// too — a directly-wired domain must supply every procedure under its top-level contract
// key or the omitted ones vanish from the router entirely (see router-direct.ts's own
// note). Both used to also keep a legacy registration
// (methods/terminal-viewport-methods.ts); slice 110 gave `RpcDispatcher` a fallback into
// this direct wiring for unary bare-envelope callers, so both dropped it — the bare-string
// paths that reach them are unchanged (see below), only the server-side plumbing that
// serves them changed.
// `updateViewport` is one of the two methods `shouldUseCachedRequestConnection`
// (main/runtime/environment-transport-routing.ts) routes to a cached bare-envelope
// connection ahead of the oRPC gate for cross-host "environment" targets. Slice 94
// re-audited this ordering against slice 84's `options.envelope` precedent and declined to
// reorder it: the desktop renderer's `terminal-pane/remote-runtime-pty-transport.ts`
// now dispatches through the negotiated oRPC client and only lands on this bare-string path
// when that negotiation falls back to legacy — but the mobile client's runtime oRPC transport
// independently latches its *whole* connection into the same bare-string legacy mode
// (permanently for a pre-oRPC host, or transiently on any capability-probe error) and
// dispatches `terminal.send`/`updateViewport` through it exactly like `terminal.subscribe`.
// Slice 94 flagged this as blocking outright retirement (a client stuck in that mode would
// see a terminal it could not type into or resize) — slice 110's dispatcher fallback
// resolves that at the layer slice 94 didn't
// consider: the server now serves the bare envelope directly instead of requiring the
// client to negotiate, so the legacy registration itself became removable without touching
// this routing. `unsubscribe` is the bare-method-name cleanup companion
// `shared/remote-runtime/shared-control-protocol.ts`'s `getCleanupRequest()` emits for
// `coworking.host.subscribeTerminal`, never through oRPC negotiation; the dispatcher
// fallback serves it the same way. The other six leaves have no such caller and were
// retired from the legacy registry outright.
export function terminalViewportLeaves() {
  return {
    resizeForClient: runtimeImplementation.terminal.resizeForClient.handler(
      wireRuntimeMethod('terminal.resizeForClient', handleTerminalResizeForClient)
    ),
    setDisplayMode: runtimeImplementation.terminal.setDisplayMode.handler(
      wireRuntimeMethod('terminal.setDisplayMode', handleTerminalSetDisplayMode)
    ),
    restoreFit: runtimeImplementation.terminal.restoreFit.handler(
      wireRuntimeMethod('terminal.restoreFit', handleTerminalRestoreFit)
    ),
    getDisplayMode: runtimeImplementation.terminal.getDisplayMode.handler(
      wireRuntimeMethod('terminal.getDisplayMode', handleTerminalGetDisplayMode)
    ),
    updateViewport: runtimeImplementation.terminal.updateViewport.handler(
      wireRuntimeMethod('terminal.updateViewport', handleTerminalUpdateViewport)
    ),
    unsubscribe: runtimeImplementation.terminal.unsubscribe.handler(
      wireRuntimeMethod('terminal.unsubscribe', handleTerminalUnsubscribe)
    ),
    getAutoRestoreFit: runtimeImplementation.terminal.getAutoRestoreFit.handler(
      wireRuntimeMethod('terminal.getAutoRestoreFit', handleTerminalGetAutoRestoreFit)
    ),
    setAutoRestoreFit: runtimeImplementation.terminal.setAutoRestoreFit.handler(
      wireRuntimeMethod('terminal.setAutoRestoreFit', handleTerminalSetAutoRestoreFit)
    )
  }
}
