import { terminalLifecycleLeaves } from './terminal-lifecycle'
import { terminalManagementLeaves } from './terminal-management'
import { terminalReadLeaves } from './terminal-read'
import { terminalStreamLeaves } from './terminal-stream'
import { terminalViewportLeaves } from './terminal-viewport'

// Why: `terminal` is 33 leaves under one top-level contract key, including the nested
// `management` sub-router — the same "one key, many files" shape browser.ts documents
// for its 83 leaves (docs/runtime-orpc-migration.md Phase 6, 切片 88). Every sibling file
// exports a plain leaf-object builder (never wrapped in `terminal:`), and this file is
// the only place that assembles them under the one `terminal` key; a second top-level
// `terminal: {...}` spread anywhere else in router-direct.ts would silently clobber this
// one via plain object spread. `terminal` was the last domain still fully bridged through
// router-bridge.ts — every leaf carried a legacy registration only because
// `bridgeRuntimeRouter`'s completeness walk in router.ts operates on whole top-level
// contract keys, not because each leaf needed one. Five leaves keep their legacy twin for
// a real bare-string caller each (see terminal-stream.ts's and terminal-viewport.ts's own
// notes for which and why); the other 28 — including all four `management.*` leaves —
// retired from the legacy registry outright now that `terminal` itself is direct-wired.
// `terminal.multiplex` (and the binary framing it shares with `terminal.subscribe`) is
// deliberately untouched: slice 87 confirmed no client-initiated, out-of-band,
// stream-addressed binary primitive exists in the modern oRPC client/transport stack to
// replace its dedicated socket, so this slice only adds the direct wiring — it does not
// change how a single byte of terminal output travels.
export const terminalRuntimeHandlers = {
  terminal: {
    ...terminalReadLeaves(),
    ...terminalLifecycleLeaves(),
    ...terminalViewportLeaves(),
    ...terminalStreamLeaves(),
    management: {
      ...terminalManagementLeaves()
    }
  }
} as const
