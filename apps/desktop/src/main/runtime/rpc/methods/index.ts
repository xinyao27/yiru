import type { RpcAnyMethod } from '../core'
import { CLIENT_EVENT_METHODS } from './client-events'
import { COWORKING_HOST_METHODS } from './coworking-host'
import { ORCHESTRATION_METHODS } from './orchestration/methods'
import { SESSION_TAB_METHODS } from './session-tabs'
import { TERMINAL_METHODS } from './terminal'

// Why: a flat manifest keeps registration order explicit and provides one
// grep-point for "what methods does the RPC server expose?" — useful when
// auditing the security boundary or wiring new CLI commands.
// `cli`, `settings`, `ui`, `repo`, `worktree`, `clipboard`, `host`,
// `preflight`, `nativeChat`, `notifications`, `mobile`, `accounts`, `skills`,
// `speech`, `agentStatus`, `projectGroup`, `projectHostSetup`,
// `folderWorkspace`, `workspaceCleanup`, `workspacePorts`, `workspaceSpace`,
// `rateLimitResume`, `git`, `github`, `gitlab`, `automation`, `computer`, `emulator`,
// `hostedReview`, `project`, `markdown`, `notebook`, `diagnostics`, `stats`,
// `agentTeams`, `aiVault`, `usage`, `browser`, `files` (including its
// `readLogTail`/`watchLogTail` leaves, which used to live in this file's own
// `LOG_TAIL_METHODS`), and the top-level `workspace` are deliberately absent —
// Phase 6 D-stage domains wired directly against the contract in
// orpc/router-direct.ts instead of through this legacy registry. `status` is
// absent too, but not for this reason — see its own paragraph near `terminal`
// below, next to `orpc/router-direct/status.ts`'s note. Their web
// callers go through the web shim's own
// `callRuntimeProcedure`, or shared renderer code's `callRuntimeOrpc`, which
// both negotiate a real oRPC peer, so they never need this registry
// (`repo`/`worktree` cleared this once the shared-renderer environment
// transport was moved onto that same negotiated peer — see
// docs/runtime-orpc-migration.md Phase 6 D-stage, 切片 63/64;
// `clipboard`/`host`/`preflight`/`nativeChat`/`notifications`/`mobile`
// followed the same clearance, 切片 66; `accounts`/`skills`/`speech` followed
// it too, 切片 67 — each verified against its shared renderer client
// (`provider-accounts-client.ts`, `skill-manage-client.ts`, and the absence of
// any live `speech.*` caller anywhere in the tree) rather than the web shim,
// since none of the three has its own `createXApi()` entry in
// `renderer/web/preload-api.ts`). `agentStatus` has its own `createWebXApi()`-
// shaped implementation in the web shim; `projectGroup`/`projectHostSetup`/
// `folderWorkspace`/`workspaceCleanup` are reached only through shared
// renderer code's `callRuntimeOrpc` + environment target
// (`repos.ts`/`workspace-cleanup-client.ts`), the class of call 切片 63/64
// moved onto the negotiated peer; `workspaceSpace`/`rateLimitResume` now have
// renderer-facing oRPC callers instead of Electron preload calls. `workspacePorts`
// (`lib/workspace-port-actions.ts`'s `scan`/`kill`, plus
// `workspace-port-events-client.ts`'s `events.subscribe`) is the exact same
// shape and was verified the same way in 切片 60/64, but stayed dual-registered
// past 切片 68 because its clearance had been checked against a stale mental
// model of the web transport (切片 60's restoration predates 切片 63's fix).
// 切片 86 re-verified it against the current code — `isWebRuntimeClient()` now
// dispatches through `createWebEnvironmentRuntimeOrpcClient`, which forwards
// contract paths generically and needs no per-domain web shim entry — and
// confirmed no bare-string caller exists anywhere (desktop main/renderer/web/
// preload/relay/cli, or mobile) and that the stream never used
// `shouldUseSharedControlSubscription`'s reconnect/replay-tagging class, so
// all three leaves retired outright with no legacy twin left behind.
// `git`/`github`/`gitlab` followed too, 切片 71: `git` has its own
// `createGitApi()` in the web shim for most leaves, with the handful it
// omits (the AI-generation quartet, `bulkDiscard`, `checkout`,
// `localBranches`) reached only via shared renderer code's `callRuntimeOrpc`
// + environment target (`renderer/runtime/git-client.ts`) or mobile's own
// negotiated oRPC client (`checkout`/`localBranches` have no desktop caller
// at all); `github` mixes a partial web-shim implementation
// (`createGitHubApi()`'s `prForBranch`/`setPRFileViewed`/`events.subscribe`)
// with the same shared-renderer `callRuntimeOrpc` pattern for the rest
// (`renderer/components/github/state.ts` and siblings), plus a few leaves
// (`listLabels`, `prFileContents`, `addPRReviewComment`) with no caller
// anywhere in the tree; `gitlab` has no web-shim entry at all but every live
// caller goes through the same shared-renderer `callRuntimeOrpc` path
// (`renderer/components/workspace-panel/hosted-review-gitlab-actions.ts` and
// siblings). None of the three touches the bare-string
// `window.api.runtimeEnvironments.call`/`.subscribe` channel that pins
// `session`/`runtime` below.
// `automation`, `computer`, `emulator`, `hostedReview`, `project`,
// `markdown`, `notebook`, `diagnostics`, `stats`, `agentTeams`, and
// `workspace` cleared 切片 72 the same way: every live caller is either the
// semantic renderer clients (`emulator.events.subscribe` now lives in
// `renderer/runtime/emulator-events-client.ts`; diagnostics/notebook use
// `callRuntimeProcedure()` in `renderer/web/preload-api.ts`), shared renderer
// code's `callRuntimeOrpc` with an explicit `{ kind: 'local' }` target (the
// `computer.*`/`emulator.*` action leaves — same reasoning as `cli` in 切片
// 59: a `{ kind: 'local' }` target never leaves the process via the
// MessagePort connection, so it can't reach a bare-string channel at all),
// or `callRuntimeOrpc` + an environment target that 切片 63/64 moved onto the
// negotiated peer (`getActiveRuntimeTarget()` call sites across
// `hosted-review.ts`/`repos.ts`/`memory-state.ts`/`state.ts`/`file-client.ts`-
// style slices, and `ipynb-viewer.tsx`'s explicit environment target). CLI
// and mobile callers (`agentTeams.*`, `workspace.openPath`, `project.list`)
// were already real oRPC and unaffected either way. `markdown.readTab`/
// `saveTab` had no desktop caller at all (only mobile, over its own
// always-oRPC transport) — they used to live inside `SESSION_TAB_METHODS`
// for filing convenience, unrelated to why `session.tabs.*` itself must
// stay (see below); they're carved out into their own direct-wired entry
// (`editor-documents.ts`) rather than following `session.tabs.*`'s legacy
// twin. `project` and `projectHostSetup`'s legacy methods happened to share
// `./project-runtime-rpc-methods.ts` for the same filing-convenience reason
// — both are direct-wired now, `project` as of 切片 72.
// `files` is the "contract surface much larger than the legacy count" shape
// (docs/runtime-orpc-migration.md Phase 6): every leaf is reached one of the
// three ways above (`files.write`/`stat`/`listAll`/… via
// `file-client.ts`'s `callRuntimeOrpc` + `getActiveRuntimeTarget()`;
// `files.watchLogTail` via the web shim's own `startWebLogTailWatch()`; the
// mobile-only `resolveTerminalPath`/`readTerminalArtifact*`/
// `writeTerminalArtifact`/`searchPaths`/`open`/`openDiff` leaves over
// mobile's always-oRPC transport) — so the whole domain went, not just
// `readLogTail`/`watchLogTail`, which used to be split into this file's own
// `LOG_TAIL_METHODS` for filing convenience.
// `coworking` (`COWORKING_HOST_METHODS`, i.e. the contract's
// `coworking.host.*`) is PARTIALLY retired (切片 81) on the same basis 切片
// 79/80 established for `ai-vault`/`provider-usage`: its live caller,
// `main/coworking/paired-runtime/*` (the owner's own backend reaching into a
// *remote* Yiru host's coworking session, keyed by `environmentId`; see 切片
// 27 on why this is distinct from the renderer-facing
// `coworking.sharing.*` surface), goes through `callRuntimeEnvironmentExistingRoute()`
// → `RemoteRuntimeSharedControlConnection.existingRoute`, which 切片 79 changed
// to try the negotiated oRPC tunnel unconditionally (its own `Why:` comment
// explains why no `RuntimeMethodContract` gate is needed there: the function
// forwards only coworking's ten unary leaves). That unlocked
// `listWorktrees`/`inspectWorktree`/`canonicalizePath`/`invoke`/
// `invokeSession`/`listLiveSessions`/`listHistoricalSessionPage`/
// `releaseHistoricalSessionPage`/`revokeWorktree`/`releaseChannel`, now
// direct-wired (`orpc/router-direct/coworking-host.ts`) and dropped from this
// registry. `subscribeTerminal`/`subscribeSessionChanges` are real
// `eventIterator` leaves whose only callers
// (`main/coworking/paired-runtime/host-adapter.ts`'s `subscribe()`,
// `session-change-subscriptions.ts`) use
// `subscribeRuntimeEnvironmentExistingRoute`/`...RetainedExistingRoute` —
// bare-method-name shared-control subscribes that 切片 79 did not touch, the
// same reconnect/replay-tagging class `session`/`runtime`'s own former
// streams (below) shared. `unsubscribeSessionChanges` is unary and is the
// cleanup companion of `subscribeSessionChanges`: its only caller
// (`shared/remote-runtime/shared-control-protocol.ts`'s `getCleanupRequest`)
// sends it as a bare cleanup envelope over that same unnegotiated connection
// — same shape as `session.tabs.unsubscribe`'s former pinning below — but
// slice 110 gave `RpcDispatcher` a fallback into the direct wiring for
// exactly this class of unary bare-envelope caller, so it dropped its legacy
// registration first; the bare envelope itself was unchanged. `coworking`
// is now FULLY retired (切片 112): `subscribeTerminal`/`subscribeSessionChanges`
// dropped their own legacy registrations once `RpcDispatcher` gained the
// streaming sibling of that same fallback
// (legacy-dispatch-fallback.ts's `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`),
// which drains the direct-wired procedure through `emit` for exactly this
// shape of caller. The direct wiring alone now serves both the real oRPC
// path and the bare-envelope caller — still required regardless, because a
// directly-wired domain must supply every procedure under its top-level
// contract key or the omitted ones vanish from the router entirely.
// `COWORKING_HOST_METHODS`/`COWORKING_HOST_SESSION_METHODS` are now empty
// arrays kept for the same reason `ORCHESTRATION_METHODS` is (see its own
// note).
// `session` and `runtime` are FULLY retired (切片 73/112) — both domains are
// now direct-wired in their entirety (agent-session.ts covers `session`,
// runtime-events.ts covers `runtime`), which is what makes a partial legacy
// retirement possible at all: `bridgeRuntimeRouter`'s walk only requires
// legacy registration for domains still routed through it, and a
// directly-wired domain is exempt regardless of what stays in this file. The
// same bare-string-channel hazard 切片 67/68 first caught in `session.tabs.*`/
// `runtime.clientEvents.*` — `window.api.runtimeEnvironments.call`/
// `.subscribe` reached directly with a literal method name, which never
// negotiates oRPC on web (`WebRuntimeClient.call()`/
// `subscribeOnCurrentConnection()` always send the legacy
// `{id, deviceToken, method, params}` envelope) or from Electron reaching a
// remote host (`environment-transport-routing.ts` routes the same channel to
// the target host's legacy dispatcher) — still reaches exactly four leaves
// after re-enumerating every call site (切片 73): `session.tabs.subscribe`/
// `subscribeAll` (`web-session-tabs-sync.ts`'s Electron branch) and their
// cleanup companions `session.tabs.unsubscribe`/`unsubscribeAll`
// (`shared/remote-runtime/shared-control-subscriptions.ts`'s teardown path),
// plus `runtime.clientEvents.subscribe`/`unsubscribe`
// (`renderer/runtime/client-events.ts`'s Electron branch and the same
// shared-control teardown path). Of those, the two streaming leaves —
// `session.tabs.subscribe`/`subscribeAll` and `runtime.clientEvents.subscribe`
// — needed a legacy registration the longest: slice 110 gave `RpcDispatcher`
// a fallback into the direct wiring for unary bare-envelope callers first, so
// their three unary cleanup companions (`session.tabs.unsubscribe`/
// `unsubscribeAll`, `runtime.clientEvents.unsubscribe`) dropped theirs before
// the streaming leaves could; slice 112 gave `RpcDispatcher` the streaming
// sibling of that fallback, which retired the two streaming leaves too.
// `SESSION_TAB_METHODS`/`CLIENT_EVENT_METHODS` below are now empty arrays,
// kept for the same reason `ORCHESTRATION_METHODS` is — see their own
// file-level `Why:` notes for the full call-site history. Every other
// `session.tabs.*` leaf (`list`/`listAll`/`activate`/`close`/
// `createTerminal`/`move`/`updatePaneLayout`/`setTabProps`) and both
// `runtime.driverEvents.subscribe`/`progressEvents.subscribe` had zero such
// callers — every real call site uses `callRuntimeOrpc`/
// `callRuntimeOrpcByPath` (session) or the web shim's own negotiated
// `createRuntimeStreamFanOut()` (runtime) — so 切片 73 retired those ten
// leaves outright; their handlers moved to plain exports
// (session-tabs-handlers.ts, driver-events.ts, host-progress-events.ts).
// `browser` is retired outright (切片 78 pinned fifteen leaves because
// `apps/mobile/src/browser/pane.tsx` called `client.sendRequest(...)`/
// `client.subscribe(...)` directly with a literal method name — the bare
// `{id, deviceToken, method, params}` envelope, never `client.orpc`; 切片 83
// moved every one of those call sites onto `callRuntimeOrpc`/
// `subscribeRuntimeOrpc`, including `screencast`, since mobile's transport
// already carries the connection-scoped binary frames the same way regardless
// of which path established the subscription — see
// `apps/mobile/src/transport/runtime-orpc-subscriptions.ts`'s
// `isRuntimeOrpcBrowserStreamPath` handling). The whole domain is direct-wired
// (orpc/router-direct/browser*.ts); every leaf's real caller is the CLI's own
// always-real-oRPC client (`client.rpc.browser.*` in
// `cli/handlers/browser-*.ts`), the desktop renderer's `callRuntimeOrpc` +
// environment target (`browser-pane.tsx`/`state.ts`), mobile's now-negotiated
// `client.orpc`, or has no caller at all.
// `browser.guestEvents.subscribe` retired outright (zero legacy twin) — its
// only caller is the web shim's own `client.browser.guestEvents.subscribe`
// (`renderer/web/preload-api.ts`), always real oRPC.
// `externalEditor` and `updater` cleared 切片 77 and joined host-tooling.ts.
// Both used `contract:`-reference registration (`defineMethod({ contract:
// SOME_CONTRACT, ... })` rather than a `name: '...'` literal), which is why
// every earlier survey that grepped for `name:` literals to count remaining
// legacy domains missed them — `ai-vault`/`provider-usage`/
// `terminal-management` share the same reference-style shape and must be
// counted the same way. `status` used to as well, until slice 110 dropped
// its registration outright (see the `terminal` paragraph below for the
// mechanism that made that possible). `externalEditor.openRemoteSsh` turned out to
// be dead surface: its only call site
// (`renderer/components/sidebar/worktree-path-opening.ts`) requires both
// `runtimeEnvironmentId` and `connectionId`, and `Repo.connectionId` has been
// dead since remote hosts were removed (see the field's own comment in
// `shared/types.ts`) — so the leaf is unreachable by construction, not
// merely uncalled today. `updater` (the contract namespace behind
// `client.updater.getStatus/check/download/install`) is distinct from the
// preload `updater` group (`window.api.updater.*`, shell-only per 切片 19,
// stubbed to no-ops in the web shim's `createUpdaterApi()`); its one live
// caller is `renderer/store/slices/remote-server-updates.ts`, shared
// renderer code that already goes through `callRuntimeOrpc` with an
// environment target — the class 切片 63/64 moved onto the negotiated peer.
// `ai-vault` and `provider-usage` (the contract's `usage.cursor`) cleared
// the gate in 切片 80, on top of the negotiation 切片 79 added for
// main-process-to-main-process callers. Both live callers —
// `main/ai-vault/runtime-session-scanner.ts`'s `scanRuntimeAiVaultSessions()`
// and `main/index.ts`'s `setRemoteCursorUsageFetcher()`, reaching a
// *different* paired Yiru host via `environment-transport-routing.ts`'s
// `callRuntimeEnvironment()` — already passed the *contract object*
// (`AI_VAULT_LIST_SESSIONS_CONTRACT`/`CURSOR_USAGE_GET_CONTRACT`), never a
// bare method string, so 切片 79's `typeof contract !== 'string'` gate in
// that file picks them up automatically once `supportsRuntimeOrpcTunnel()`
// confirms the peer negotiates oRPC; only when it doesn't does the call fall
// through to the old bare-envelope path, same as every other domain retired
// under this scheme. Both leaves are now direct-wired
// (`orpc/router-direct/ai-vault.ts`, `orpc/router-direct/provider-usage.ts`).
// `status` (i.e. `status.get`) is fully retired (切片 110), unlike
// `ai-vault`/`provider-usage` above: it is the capability-negotiation
// bootstrap probe, called before a caller even knows whether oRPC is
// supported, so it can never be required to negotiate one first — the
// clearance mechanism above (a caller that now passes the real contract
// object, or a negotiated peer) structurally does not apply to it. What
// unlocked it instead: `RpcDispatcher` (dispatcher.ts) gained a fallback
// that, on a legacy-registry miss for a small, explicit, audited set of
// unary method names, invokes the same direct-wired oRPC procedure
// (`orpc/router-direct/status.ts`) in-process instead of erroring. A bare
// `{id, method, params}` envelope for `status.get` is served exactly as
// before; only the code path that serves it moved from this registry to
// that fallback. `handleStatusGet` moved to a plain export (methods/status.ts).
// `terminal` (切片 88) is now direct-wired in its entirety
// (`orpc/router-direct/terminal.ts`), the last domain that used to be fully
// bridged — every one of its 33 leaves, including the nested
// `terminal.management.*` sub-router, used to carry a legacy registration
// only because `bridgeRuntimeRouter`'s completeness walk in router.ts
// operates on whole top-level `runtimeContract` keys, not because each leaf
// needed one (the same shape `session`/`runtime` established in 切片 73).
// `terminal.multiplex`, `terminal.subscribe`, `terminal.send`,
// `terminal.updateViewport`, and `terminal.unsubscribe` are the five leaves
// with a real bare-string caller each — see `TERMINAL_METHODS`'s own note in
// terminal.ts and `TERMINAL_VIEWPORT_METHODS`'s in terminal-viewport-methods.ts
// for which caller forces which leaf. `send`/`updateViewport`/`unsubscribe`
// are unary, so slice 110's `RpcDispatcher` fallback into the direct wiring
// — the same mechanism that let `status.get` drop out of this file entirely
// (see above) — let them drop theirs first; `multiplex`/`subscribe` are
// streaming and needed slice 112's streaming sibling of that fallback
// (legacy-dispatch-fallback.ts's `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES`)
// before they could drop theirs too — `terminal` is now FULLY retired, no
// legacy registration left. The other 28 leaves, including all four
// `management.*` leaves, retired outright with no caller of either kind.
// `terminal.multiplex`'s dedicated binary socket is unchanged by any of
// this: slice 87 confirmed no client-initiated, out-of-band, stream-addressed
// binary primitive exists in the modern oRPC client/transport stack to
// replace it, and slice 112 only retired the *dispatch* half of `multiplex`
// (the JSON control-plane `subscribe`/`onResponse`/`onError`/`onClose`) — the
// binary leg (`onBinary`, client-side keystrokes) never went through
// `RpcDispatcher` at all, so it is untouched either way; see
// docs/runtime-orpc-migration-phase6-streaming-fallback-design.md §4 for the
// full distinction between "the dispatch fallback covers multiplex too" and
// "multiplex is unblocked" — only the former is true.
//
// This registry is now empty (切片 112) — every constituent array above is.
// `this.registry` (dispatcher.ts, built from `ALL_RPC_METHODS` via
// `buildRegistry`) now misses on every request, so `RpcDispatcher.dispatch`/
// `dispatchStreaming` always fall through to `serveLegacyDispatchFallback` or
// its streaming sibling — a bare-envelope caller's only remaining path,
// unconditionally, for every method. This is a *leaf-level* registry, though,
// distinct from `router-direct.ts`'s *domain-level*
// `DIRECTLY_WIRED_RUNTIME_DOMAINS`: that one was already covering every
// top-level `runtimeContract` key before this slice (since 切片 88 made
// `terminal` the last domain to go fully direct-wired), which means
// `router.ts`'s `bridgeRuntimeRouter(bridgedRuntimeImplementation)` call was
// already receiving an empty object — `bridgeRuntimeProcedure`/
// `router-bridge.ts` had nothing left to bridge before 切片 112 touched
// anything, and this slice's retirement of the last 7 leaves doesn't change
// that fact, only confirms it holds for the leaf-level registry too. See
// dispatcher.ts's own note on what the dispatcher fallbacks becoming the only
// path does and does not make dead code.
export const ALL_RPC_METHODS: readonly RpcAnyMethod[] = [
  ...TERMINAL_METHODS,
  ...ORCHESTRATION_METHODS,
  ...SESSION_TAB_METHODS,
  ...CLIENT_EVENT_METHODS,
  ...COWORKING_HOST_METHODS
]
