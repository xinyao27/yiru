# Converge Electron IPC and runtime RPC contracts

Type: task
Status: resolved
Blocked by: 06

## Question

Make validated method contract modules the single source for ordinary request/response names, parameters, results, and capabilities across Electron, WebSocket, and CLI adapters. Remove duplicate preload/main declarations while deliberately retaining explicit hot PTY and event-stream paths.

## Comments

### Contract boundary

The first shared contract cohort is the exact ordinary request/response surface used across the
Electron renderer bridge, paired WebSocket client, and CLI: `status.get`, `aiVault.listSessions`,
`git.status`, `repo.list`, `repo.add`, `repo.searchRefs`, `worktree.list`, `worktree.create`,
`worktree.set`, and `worktree.rm`. Each contract now owns its literal name, Zod parameter schema,
result type, and mobile availability; server registrations and every adapter path consume the same
object. The remaining legacy raw calls are outside this three-adapter cohort and can migrate by
domain without weakening this boundary.

PTY, binary terminal multiplexing, subscriptions, and event streams remain transport-owned because
their framing, cancellation, replay, and backpressure contracts are not one-shot RPC semantics.
The SSH Git mux and spool protocols also retain their own `git.status` schemas: those operations use
`worktreePath`/`worktreeRef`, not the runtime RPC worktree selector, so merging them would erase a
real protocol distinction.

### Resolution

- Added typed shared runtime-method contracts and contract-aware adapters for Electron IPC, Unix /
  named-pipe CLI calls, one-shot and cached WebSocket calls, abortable remote calls, and the browser
  runtime client.
- Moved reusable runtime, Git, and worktree parameter validators out of main-process ownership and
  removed the duplicate direct `runtime:getStatus` preload/main channel.
- Replaced the separate 198-entry mobile allowlist with capability metadata on the registered
  method/contract. A pre/post comparison proves 198 expected, 198 actual, zero missing, zero extra.
- Made dispatcher method injection explicit, so focused tests do not import all production methods
  or build-time telemetry globals.
- Split renderer compatibility-cache and response-unwrapping responsibilities out of the oversized
  runtime client (366 lines to 116) without changing its public imports.
- Removed dead remote `pendingFirstAgentMessageRename` payload fields that the existing strict
  worktree schema had always stripped before handler execution.

### Verification

- Root typecheck, including packages, desktop node/CLI/web configs, and mobile
- 17 test files / 44 behavioral tests, including contract validation, dispatch, and mobile gating
- Zero-warning lint and format checks for every changed TypeScript file; `git diff --check`
- CLI, paired web, and Electron Vite production builds
- max-lines ratchet, localization catalog, and localization coverage
- Two-axis independent review: final Standards PASS and Spec PASS with no remaining findings
- Repository contracts pass through switch exhaustiveness, design-token budget, max-lines, and
  bundled-skill guides; skill-manifest generation remains environmentally blocked because this
  worktree lacks complete released tag history.

