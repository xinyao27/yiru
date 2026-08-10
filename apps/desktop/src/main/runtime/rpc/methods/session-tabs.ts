import type { RpcAnyMethod } from '../core'

// Why: Phase 6 D-stage — `session.tabs.*` is direct-wired in its entirety in
// orpc/router-direct/agent-session.ts (every leaf) with no legacy
// registration left. `list`/`listAll`/`activate`/`close`/`createTerminal`/
// `move`/`updatePaneLayout`/`setTabProps` were retired (切片 73) because every
// caller (`callRuntimeOrpc`/`callRuntimeOrpcByPath`) negotiates oRPC per
// call. `unsubscribe`/`unsubscribeAll` dropped theirs once slice 110 gave
// `RpcDispatcher` a unary fallback into the direct wiring (see
// session-tabs-handlers.ts). `subscribe`/`subscribeAll` themselves are
// streaming — web and Electron-as-remote-client reach them through
// `window.api.runtimeEnvironments.subscribe`, a bare
// `{id, deviceToken, method, params}` channel with no per-call capability
// negotiation (`renderer/runtime/web-session-tabs-sync.ts`'s Electron branch,
// `main/runtime/environment-transport-routing.ts`'s
// `subscribeRemoteRuntimeSharedControlRequest`) — and stayed legacy-registered
// until slice 112 gave `RpcDispatcher` the streaming sibling of that same
// fallback (legacy-dispatch-fallback.ts's
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`), which drains
// `handleSessionTabsSubscribe`/`handleSessionTabsSubscribeAll`
// (session-tabs-handlers.ts, still exported and now only reached via that
// fallback and the direct wiring) through `emit`. See
// docs/runtime-orpc-migration.md Phase 6 D-stage, 切片 70/73/110/112. Kept as
// a real (now empty) array rather than deleted, matching
// methods/orchestration/methods.ts's precedent.
export const SESSION_TAB_METHODS: RpcAnyMethod[] = []
