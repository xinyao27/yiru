# Codex real-home and self-contained account parity

This report audits Orca commit `e58de71f5` against Yiru's current runtime-protocol architecture. The migration intentionally ports user-visible behavior rather than cherry-picking the upstream commit.

## Parity matrix

| Area | Required behavior | Yiru result | Validation |
| --- | --- | --- | --- |
| System-default home | A host system-default launch uses the user's canonical Codex home with no Yiru-managed `CODEX_HOME`; a user-defined custom home remains on the compatible managed lane. | Complete. The rollout is production-on with a test-only override, recognizes the private `YIRU_CODEX_HOME` ownership marker, and gates the real-home lane on usable hooks. | Real-home flag/path tests; node and CLI typechecks. |
| Managed host accounts | Every host account owns a complete, marker-validated `codex-accounts/<id>/home`, including auth, config, hooks, and resources. Missing or foreign homes clear selection instead of being trusted or deleted. | Complete. Host accounts launch directly from their own homes; Windows login cleanup kills the process tree and retries removal. | Ownership tests plus the audit-phase service suite. |
| WSL accounts | Keep account/auth state scoped per distro, preserve Linux path semantics, and never apply host ownership or trust state to a guest home. | Complete. WSL keeps its distro-local managed lane, uses encoded baseline-compatible commands, copies global instructions safely, and strips source-home Yiru trust before config promotion. | Managed-trust reconciliation test; CLI/node typechecks. |
| SSH/runtime hosts | Resolve account/home state on the host that executes Codex; never reuse controller-host capability, path, or trust state. | Complete. A Yiru runtime performs native host resolution locally; SSH scanning and PTY env deletion stay in the remote execution namespace. Unsupported trust RPCs degrade through host-scoped cached fallback. | Remote scanner/dedup tests; renderer/web/mobile typechecks. |
| Legacy migration | Move legacy shared auth and MCP state into the correct account home without overwriting newer bytes or accepting an identity mismatch. | Complete. Migration is ownership-checked, idempotent, freshness-aware, and retains the compatible shared lane only where required. | Audit-phase runtime-home/service suites; focused auth-identity coverage through retained core tests. |
| Config and resources | Managed homes mirror ordinary settings/resources while keeping home-local project/hook trust and rejecting OAuth account creation under a custom model provider. | Complete. Relative paths are rewritten with platform-aware utilities; host self-contained homes merge local state, while WSL overwrite copies remove only proven Yiru-managed source trust. | Managed-trust test; targeted lint and node typecheck. |
| Hooks and trust | Install real-home hooks without clobbering user JSON, preserve raw bytes/backups, ask Codex app-server to grant trust, verify it, and roll back before deterministic fallback. | Complete. Capability and retry caches are host-scoped; ledgers bind hashes to binary stamps/signatures; unsupported or failed RPCs safely use the prior self-computed lane. | Hook install, app-server, grant, ledger, host, and reconciliation tests. |
| Packaged trust-grant entry | The synchronous main-process launch gate must invoke a bundled plain-Node child that has a live JSONL event loop and no Electron dependency. | Complete. Dev and packaged path resolution handles `app.asar.unpacked`; the entry is a guarded Electron-Vite input. | Electron-Vite production build, plain-node dependency guard, entry smoke launch, and bridge path tests. |
| Session backfill | Move canonical real-home transcripts into the managed-history view without partial promotion, overwrite races, or blocking launch. | Complete. The migration uses hard links first, staged no-replace copy fallback, atomic marker/audit state, cancellation checks, and bounded retry behavior. | Backfill core tests. |
| Session index healing | Make backfilled sessions visible to Codex's index without corrupting existing entries or repeatedly probing unsupported app-server behavior. | Complete. Healing runs after backfill, reads threads through the app-server client, and records retry/success ledgers. | Index-heal and app-server core tests. |
| AI Vault discovery | Scan canonical, legacy, and all account homes locally and over SSH without showing hardlink duplicates. | Complete. Pre-parse inode identity and post-parse session/rollout identity deduplicate copies while keeping execution hosts isolated; canonical rows use `codexHome: null`. | Dual-root and root-dedup tests. |
| Process environment | Real-home Codex must not inherit a Yiru-owned routed home, while managed and non-Codex launches keep their environment. | Complete. PTY, persistent daemon, commit-message, local/WSL/SSH runtime, renderer, web-runtime, and mobile resume paths carry deletion semantics end to end. The daemon compares its own marker before removing an inherited pair. | Commit-message and desktop/mobile resume tests; node/web/mobile typechecks. |
| Identity and auth warnings | System default shows its live OAuth identity or a custom-provider explanation and must not mislabel API-key/custom-provider setups as signed out. | Complete for the host account row; remote/WSL rows remain explicitly scoped to their runtime rather than borrowing host identity. | Focused auth-warning test; web typecheck; five locale catalogs updated. |
| Failure and downgrade behavior | Missing auth, malformed config, unsupported Codex app-server versions, cancellation, and a disabled test rollout must leave a usable fallback and user data intact. | Complete. Every migration/install path is best-effort or transactional at its ownership boundary, and known-unsupported capability probes are cached per host. | Targeted fallback/core tests, lint, typechecks, and build validation. |

No user-visible parity gap remains in the audited scope.

## Task-owned files

### Account and home routing

- `apps/desktop/src/main/codex-accounts/runtime-home-service.ts`
- `apps/desktop/src/main/codex-accounts/service.ts`
- `apps/desktop/src/main/codex-accounts/wsl-codex-command.ts`
- `apps/desktop/src/main/codex-accounts/codex-auth-identity.ts`
- `apps/desktop/src/main/codex-accounts/host-codex-managed-home-ownership.ts`
- `apps/desktop/src/main/codex-accounts/legacy-shared-auth-migration.ts`
- `apps/desktop/src/main/codex/codex-home-paths.ts`
- `apps/desktop/src/main/codex/codex-real-home-flag.ts`
- `apps/desktop/src/main/codex/codex-real-home-path.ts`
- `apps/desktop/src/main/codex/codex-model-provider-config.ts`

### Hooks, trust, migration, and index repair

- `apps/desktop/src/main/agent-hooks/hook-config-write-path.ts`
- `apps/desktop/src/main/agent-hooks/hooks-json-read.ts`
- `apps/desktop/src/main/agent-hooks/installer-utils.ts`
- `apps/desktop/src/main/rolling-file-backup.ts`
- `apps/desktop/src/main/codex/codex-app-server-capability-cache.ts`
- `apps/desktop/src/main/codex/codex-app-server-capability-signal.ts`
- `apps/desktop/src/main/codex/codex-app-server-client.ts`
- `apps/desktop/src/main/codex/codex-app-server-grant-bridge.ts`
- `apps/desktop/src/main/codex/codex-app-server-grant-entry.ts`
- `apps/desktop/src/main/codex/codex-app-server-grant-envelope.ts`
- `apps/desktop/src/main/codex/codex-app-server-session.ts`
- `apps/desktop/src/main/codex/codex-hook-trust-grant.ts`
- `apps/desktop/src/main/codex/codex-managed-trust-reconciliation.ts`
- `apps/desktop/src/main/codex/codex-process-exit-deadline.ts`
- `apps/desktop/src/main/codex/codex-real-home-hook-install.ts`
- `apps/desktop/src/main/codex/codex-session-backfill-audit.ts`
- `apps/desktop/src/main/codex/codex-session-backfill-copy.ts`
- `apps/desktop/src/main/codex/codex-session-backfill-marker.ts`
- `apps/desktop/src/main/codex/codex-session-backfill-types.ts`
- `apps/desktop/src/main/codex/codex-session-backfill.ts`
- `apps/desktop/src/main/codex/codex-session-index-heal-state.ts`
- `apps/desktop/src/main/codex/codex-session-index-heal.ts`
- `apps/desktop/src/main/codex/codex-trust-config-rollback.ts`
- `apps/desktop/src/main/codex/codex-trust-grant-host.ts`
- `apps/desktop/src/main/codex/codex-trust-grant-ledger.ts`
- `apps/desktop/src/main/codex/codex-user-hook-trust-rebase-client.ts`
- `apps/desktop/src/main/codex/codex-user-hook-trust-rebase.ts`
- `apps/desktop/src/main/codex/codex-config-mirror.ts`
- `apps/desktop/src/main/codex/codex-config-path-reference-rewrite.ts`
- `apps/desktop/src/main/codex/codex-hook-identity.ts`
- `apps/desktop/src/main/codex/codex-session-file-listing.ts`
- `apps/desktop/src/main/codex/codex-wsl-hook-install-plan.ts`
- `apps/desktop/src/main/codex/config-toml-line-scan.ts`
- `apps/desktop/src/main/codex/config-toml-trust.ts`
- `apps/desktop/src/main/codex/hook-service.ts`
- `apps/desktop/src/main/codex/hook-trust-promotion.ts`

### AI Vault and process/runtime plumbing

- `apps/desktop/src/main/ai-vault/codex-session-root-dedup.ts`
- `apps/desktop/src/main/ai-vault/remote-session-file-stat.ts`
- `apps/desktop/src/main/ai-vault/remote-session-scanner-discovery.ts`
- `apps/desktop/src/main/ai-vault/remote-session-scanner-sources.ts`
- `apps/desktop/src/main/ai-vault/remote-session-scanner-types.ts`
- `apps/desktop/src/main/ai-vault/remote-session-scanner.ts`
- `apps/desktop/src/main/ai-vault/session-scanner-discovery.ts`
- `apps/desktop/src/main/ai-vault/session-scanner-types.ts`
- `apps/desktop/src/main/ai-vault/session-scanner.ts`
- `apps/desktop/src/main/daemon/pty-subprocess.ts`
- `apps/desktop/src/main/ipc/pty.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/runtime/rpc/methods/session-tabs-schemas.ts`
- `apps/desktop/src/main/runtime/rpc/methods/session-tabs.ts`
- `apps/desktop/src/main/runtime/rpc/methods/terminal.ts`
- `apps/desktop/src/main/runtime/yiru-runtime.ts`
- `apps/desktop/src/main/text-generation/commit-message-agent-environment.ts`

### Desktop/mobile resume and identity surfaces

- `packages/workbench-model/src/agent.ts`
- `packages/workbench-model/src/codex-resume-environment.ts`
- `apps/desktop/src/preload/api-types.ts`
- `apps/desktop/src/shared/runtime-types.ts`
- `apps/desktop/src/shared/types.ts`
- `apps/desktop/src/renderer/src/components/settings/accounts-pane.tsx`
- `apps/desktop/src/renderer/src/components/settings/codex-account-auth-warning.ts`
- `apps/desktop/src/renderer/src/components/tab-group/ai-vault-session-drop-layer.tsx`
- `apps/desktop/src/renderer/src/components/workspace-panel/ai-vault-session-row.tsx`
- `apps/desktop/src/renderer/src/components/terminal-pane/pty-connection-types.ts`
- `apps/desktop/src/renderer/src/components/terminal-pane/pty-connection.ts`
- `apps/desktop/src/renderer/src/components/terminal-pane/pty-transport-types.ts`
- `apps/desktop/src/renderer/src/components/terminal-pane/pty-transport.ts`
- `apps/desktop/src/renderer/src/components/terminal-pane/remote-runtime-pty-transport.ts`
- `apps/desktop/src/renderer/src/components/terminal-pane/use-terminal-pane-lifecycle.ts`
- `apps/desktop/src/renderer/src/hooks/use-ipc-events.ts`
- `apps/desktop/src/renderer/src/lib/ai-vault-resume-command.ts`
- `apps/desktop/src/renderer/src/lib/ai-vault-session-drag.ts`
- `apps/desktop/src/renderer/src/lib/launch-ai-vault-session.ts`
- `apps/desktop/src/renderer/src/runtime/web-runtime-session.ts`
- `apps/desktop/src/renderer/src/runtime/web-session-commands.ts`
- `apps/desktop/src/renderer/src/store/slices/terminals.ts`
- `apps/mobile/src/session/ai-vault-resume-launch.ts`
- `apps/desktop/src/renderer/src/i18n/locales/{en,es,ja,ko,zh}.json`

### Build contracts

- `apps/desktop/build-plugins/plain-node-entry-guard.ts`
- `apps/desktop/electron.vite.config.ts`
- `apps/desktop/config/tsconfig.cli.json`

Focused test files are adjacent to the modules above and include real-home flag/path, managed-home ownership, dual-root/dedup scanning, backfill, index heal, app-server entry/client, hook trust/grant/ledger/reconciliation, commit-message environment, identity warnings, and desktop/mobile resume coverage.

## Validation

- Focused suite: **19 files, 86 tests passed**.
- `apps/desktop` node, web, and CLI typechecks passed.
- `apps/mobile` typecheck passed.
- Targeted Vite Plus lint and `git diff --check` passed.
- Electron-Vite production build passed and emitted `out/main/codex/codex-app-server-grant-entry.js`; the plain-node dependency guard passed.
- Direct plain-Node entry smoke launch returned a structured invalid-request envelope with exit status 0, proving the built entry loads without Electron.
- The standalone `packages/workbench-model` typecheck is currently blocked by the pre-existing dirty `src/agent-session-resume.test.ts` importing the Vite Plus test declaration bundle; desktop and mobile typechecks compile the new exported production module successfully.

## Intentionally not ported

- Upstream's Codex real-account validation runners, primary-home tripwire, process-shutdown harness, Electron home-isolation E2E helpers/specs, and benchmark/emulator wrapper edits are validation infrastructure rather than product behavior. Yiru uses focused tests plus its existing build/runtime validation instead.
- Upstream's `codex_trust_grant` telemetry schema and composition-root wiring are observability-only and require a broad shared telemetry contract change; trust-grant diagnostics and safe fallback behavior are present without that event.
- Upstream's bulk test-file rewrites were not copied. Yiru retains only high-value focused coverage consistent with `AGENTS.md`, without adding max-lines disables.
