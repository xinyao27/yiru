import {
  handleTerminalMultiplex,
  handleTerminalSubscribe
} from '~main/runtime/rpc/methods/terminal'
import { handleTerminalSend } from '~main/runtime/rpc/methods/terminal-send-method'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: `multiplex`/`subscribe` are split out on their own so the history of
// their bare-envelope callers stays next to the wiring instead of buried in
// terminal-read.ts/terminal-lifecycle.ts's much longer no-legacy-twin lists.
// Neither carries a legacy registration anymore — `terminal` is fully retired
// (methods/terminal.ts). `send` dropped its own once slice 110 gave
// `RpcDispatcher` a unary fallback into this direct wiring; `multiplex`/
// `subscribe` needed slice 112's streaming sibling
// (legacy-dispatch-fallback.ts's `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`)
// because both are streaming — neither's bare-string caller changed.
// `multiplex` is `shouldKeepDedicatedSubscriptionSocket`'s other member
// (main/runtime/environment-transport-routing.ts): its only caller
// (`renderer/runtime/remote-runtime-terminal-multiplexer.ts`) opens
// `window.api.runtimeEnvironments.subscribe({ method: 'terminal.multiplex', ... })`
// directly. Its event iterator remains the JSON control plane while the dedicated
// socket's negotiated, stream-addressed side channel preserves the existing binary
// framing in both directions; hosts reject peers that lack that capability. Slice 112
// retired the *dispatch* half through the streaming fallback, and the later socket-v1
// capability completed the binary transport without pooling it onto shared control.
// `send` is the other half of
// `shouldUseCachedRequestConnection` (see terminal-viewport.ts's note on `updateViewport`
// for why slice 94 kept it ahead of the oRPC gate instead of reordering it like slice 84
// did for `options.envelope`) — `remote-runtime-pty-transport.ts` now dispatches it through
// the negotiated oRPC client (`callRuntimeOrpcByPath`), so the bare-string path only fires
// when that negotiation itself falls back to legacy, same trigger as `subscribe` below;
// slice 110's dispatcher fallback is what serves it now that its legacy registration is
// gone. `subscribe`'s bare-string caller is mobile's `MobileRuntimeOrpcTransport`
// (apps/mobile/src/transport/runtime-orpc-transport.ts), which transparently falls back to a
// bare `subscribeLegacy(method, ...)` envelope when the paired host has not negotiated
// the oRPC capability — `session/terminal/stream-subscribe.ts` calls
// `runtime.terminal.subscribe` through that same gated client, now served by slice 112's
// streaming fallback instead of a legacy registration.
export function terminalStreamLeaves() {
  return {
    multiplex: runtimeImplementation.terminal.multiplex.handler(
      wireRuntimeStream('terminal.multiplex', handleTerminalMultiplex)
    ),
    subscribe: runtimeImplementation.terminal.subscribe.handler(
      wireRuntimeStream('terminal.subscribe', handleTerminalSubscribe)
    ),
    send: runtimeImplementation.terminal.send.handler(
      wireRuntimeMethod('terminal.send', handleTerminalSend)
    )
  }
}
