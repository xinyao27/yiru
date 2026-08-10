import { agentSessionRuntimeHandlers } from './router-direct/agent-session'
import { aiVaultRuntimeHandlers } from './router-direct/ai-vault'
import { automationRuntimeHandlers } from './router-direct/automation'
import { browserRuntimeHandlers } from './router-direct/browser'
import { clientSurfaceRuntimeHandlers } from './router-direct/client-surface'
import { computerUseRuntimeHandlers } from './router-direct/computer-use'
import { coworkingHostRuntimeHandlers } from './router-direct/coworking-host'
import { editorDocumentsRuntimeHandlers } from './router-direct/editor-documents'
import { emulatorRuntimeHandlers } from './router-direct/emulator'
import { filesRuntimeHandlers } from './router-direct/files'
import { gitRuntimeHandlers } from './router-direct/git'
import { githubRuntimeHandlers } from './router-direct/github'
import { gitlabRuntimeHandlers } from './router-direct/gitlab'
import { hostTelemetryRuntimeHandlers } from './router-direct/host-telemetry'
import { electronHostToolingRuntimeHandlers } from './router-direct/host-tooling'
import { hostedReviewRuntimeHandlers } from './router-direct/hosted-review'
import { orchestrationRuntimeHandlers } from './router-direct/orchestration'
import { portableHostToolingRuntimeHandlers } from './router-direct/portable-host-tooling'
import { providerToolingRuntimeHandlers } from './router-direct/provider-tooling'
import { providerUsageRuntimeHandlers } from './router-direct/provider-usage'
import { runtimeEventsRuntimeHandlers } from './router-direct/runtime-events'
import { sourceControlRuntimeHandlers } from './router-direct/source-control'
import { statusRuntimeHandlers } from './router-direct/status'
import { terminalRuntimeHandlers } from './router-direct/terminal'
import { workspaceRuntimeHandlers } from './router-direct/workspace'

// Why: Phase 6 D-stage domains are wired straight against the contract
// instead of through router-bridge.ts's legacy-registry lookup. router.ts
// excludes each key present here from the tree it hands to `bridgeRuntimeRouter`
// and merges this object over the result — that split is what makes the
// bridge usable per-domain rather than all-or-nothing (see
// docs/runtime-orpc-migration.md Phase 6, D-stage recipe). Each part under
// router-direct/ groups the domains that share a feature area (workspace,
// source control, provider tooling, provider usage, host tooling, client
// surfaces, agent session, ai-vault, git, github, gitlab, computer-use,
// automation, emulator, files, hosted-review, host-telemetry,
// editor-documents, runtime-events, browser); add a migrated domain to the
// group it belongs with. `ai-vault.ts` and `provider-usage.ts` (切片 80) each
// stand alone rather than joining a same-file neighbor: both are single-leaf
// domains unlocked by 切片 79's main-process-to-main-process oRPC
// negotiation, not by a shared feature area with anything else already here.
// `status.ts` (slice 110) is the same single-leaf shape for a different
// reason: `status.get` is the capability-negotiation bootstrap probe and can
// never itself require negotiation, so it stayed legacy-registered until
// `RpcDispatcher` gained a fallback into this direct wiring for bare,
// unnegotiated callers — see dispatcher.ts's own note.
// `coworking-host.ts` (slice 81) stands alone for the same reason plus one
// more: it is the ONLY file that may own the top-level `coworking` key (see
// files.ts's own note on why a second `{coworking:{...}}` sibling would
// silently clobber this one via plain object spread). `coworking` is now
// fully retired from the legacy registry (切片 112) — its two streaming
// leaves (`subscribeTerminal`/`subscribeSessionChanges`) and their unary
// cleanup companion (`unsubscribeSessionChanges`) all reach it over a
// bare-method-name shared-control channel with no oRPC negotiation, now
// served entirely through `RpcDispatcher`'s unary (切片 110) and streaming
// (切片 112) fallback pair instead of a legacy registration.
// `orchestration.ts` is a full-domain direct wiring with a FULL retirement
// now (slice 84): its 8 `federation*` leaves — whose only caller is the
// main-process-to-main-process worker-server dispatch
// (`callOrchestrationWorkerServer`), reaching an independently-versioned
// paired host — used to stay dual-registered in the legacy registry
// (methods/orchestration/federation/*) because that caller was structurally
// excluded from oRPC negotiation. That caller now passes real
// `RuntimeMethodContract` objects and its `orchestrationRequestId` envelope
// rides the oRPC tunnel as headers, so all 8 dropped their legacy
// registration; a peer without the oRPC capability still falls back to the
// bare envelope and its own legacy registration, so cross-version pairs stay
// safe without this file's help.
// `git`/`github`/`gitlab`
// sit beside source-control.ts (repo/worktree) conceptually, but each got its
// own file
// — the three together are 93 methods, well past what the 300-line cap
// allows in one place. `files.ts` similarly stands alone rather than
// following files-adjacent editor-documents.ts: every `files.*` leaf shares
// one top-level contract key, and router-direct.ts's plain object spread
// below would let a second `files: {...}` sibling clobber this one instead
// of merging into it (see files.ts's own note). `browser` (切片 78) is the
// same shape at a larger scale — 95 leaves under one `browser` key — so
// `router-direct/browser.ts` is itself only a thin composer: it imports six
// feature-area leaf builders (navigation, interaction, inspection, network,
// profiles, streams) from its own siblings and merges them one level below
// this file's `...browserRuntimeHandlers` spread, never as a second top-level
// `browser: {...}` object (see that file's own note). `terminal` (切片 88)
// follows the identical composer shape for the same reason: 33 leaves —
// including the nested `management.*` sub-router — under one `terminal` key,
// assembled by `router-direct/terminal.ts` from four feature-area leaf
// builders (read, lifecycle, viewport, stream) plus the management builder
// nested under its own `management: {...}` key. `terminal` was the last
// domain still routed entirely through router-bridge.ts; five of its leaves
// (`multiplex`, `subscribe`, `send`, `updateViewport`, `unsubscribe`) had a
// real bare-string caller each — see terminal-stream.ts's and
// terminal-viewport.ts's own notes. Slice 110 gave `RpcDispatcher` a fallback
// into this direct wiring for unary bare-envelope callers, which let
// `send`/`updateViewport`/`unsubscribe` drop their legacy twin; `multiplex`/
// `subscribe` are streaming and needed 切片 112's streaming sibling of that
// fallback before they could drop theirs too — `terminal` now carries no
// legacy registration anywhere. The other 28 leaves retired outright, with no
// caller of either kind.
//
// The exclusion in router.ts operates on whole top-level contract domains,
// not individual procedures — a domain entered here must supply *every*
// procedure under that key (workspacePorts.scan/kill ride along with
// events.subscribe below even though only the stream was the Phase 6
// streaming pilot), or the procedures left out of this object simply vanish
// from the router.
export const directRuntimeOrpcHandlers = {
  ...agentSessionRuntimeHandlers,
  ...aiVaultRuntimeHandlers,
  ...automationRuntimeHandlers,
  ...browserRuntimeHandlers,
  ...clientSurfaceRuntimeHandlers,
  ...computerUseRuntimeHandlers,
  ...coworkingHostRuntimeHandlers,
  ...editorDocumentsRuntimeHandlers,
  ...emulatorRuntimeHandlers,
  ...filesRuntimeHandlers,
  ...gitRuntimeHandlers,
  ...githubRuntimeHandlers,
  ...gitlabRuntimeHandlers,
  ...hostedReviewRuntimeHandlers,
  ...hostTelemetryRuntimeHandlers,
  ...electronHostToolingRuntimeHandlers,
  ...orchestrationRuntimeHandlers,
  ...portableHostToolingRuntimeHandlers,
  ...providerToolingRuntimeHandlers,
  ...providerUsageRuntimeHandlers,
  ...runtimeEventsRuntimeHandlers,
  ...sourceControlRuntimeHandlers,
  ...statusRuntimeHandlers,
  ...terminalRuntimeHandlers,
  ...workspaceRuntimeHandlers
} as const

export const DIRECTLY_WIRED_RUNTIME_DOMAINS: readonly string[] =
  Object.keys(directRuntimeOrpcHandlers)
