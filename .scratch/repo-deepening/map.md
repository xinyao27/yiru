# Complete repository deepening

Label: wayfinder:map

## Destination

All six architecture-review candidates and the identified low-risk cleanup are implemented without intentional product-behavior changes. Native, WSL, SSH, relay, mobile, web, Git 2.25, and supported forge behavior remain compatible; tests, typecheck, lint, repository contracts, and a requirement-by-requirement completion audit pass.

## Notes

- This map carries execution, not only planning, because the user explicitly requested that the full audit be implemented.
- Follow `AGENTS.md`, especially cross-platform, SSH, Git 2.25, provider compatibility, max-lines, comments, and lowercase kebab-case naming.
- Use `implement`; use `tdd` only at pre-agreed high-risk seams; finish each implementation ticket with `code-review` and a coherent commit.
- Prefer replacement over layering: once a new state owner takes responsibility, delete the former path in the same ticket.
- Add tests sparingly: characterize state machines, migrations, contract adapters, and recovery behavior rather than chasing repository-wide coverage.
- Resolve at most one ticket per work session. Newly exposed work becomes a new child ticket before the current ticket is resolved.
- Completion gates: focused tests during work; full tests, typecheck, non-fixing lint, max-lines ratchet, repository contracts, and clean worktree audit at the end.

## Decisions so far

<!-- Resolved tickets are indexed here with a one-line gist and link. -->

- [01 — Terminal authority characterization](issues/01-terminal-authority-characterization.md):
  public runtime state transitions plus real SSH relay and daemon adapter boundaries are executable,
  and PR CI now runs the repository test suite.
- [02 — Extract Terminal session authority](issues/02-extract-terminal-session-authority.md):
  one deep main-process module now owns graph, handle, PTY, driver, layout, subscription, recovery,
  presence, waiter, and exit-cleanup state; runtime and transport layers are adapters.
- [03 — Shrink YiruRuntimeService to composition](issues/03-shrink-yiru-runtime-to-composition.md):
  RPC and spool consume real command owners directly; browser screencast lifecycle/driver state and
  mobile notification live/replay sequencing now have single authorities.
- [03a — Remove implementation-detail tests](issues/03a-remove-implementation-detail-tests.md):
  class-literal, exact-source, registry-count, and self-normalizing checks are gone; remaining tests
  exercise behavior or real build, compatibility, and release contracts.
- [04 — Restore renderer state direction](issues/04-restore-renderer-state-direction.md):
  store contracts are import-free leaves, state no longer owns view registries or presentation,
  and typed command/result owners preserve remote-session and user-feedback behavior without a
  store-crossing dependency cycle.
- [05 — Promote cross-app domain and protocol ownership](issues/05-promote-cross-app-domain-protocol.md):
  three workspace packages now own cross-client contracts through stable domain entries; mobile has
  zero desktop-source imports, desktop compatibility facades are smaller, and real CJS/ESM/Metro
  build paths are verified.

## Not yet specified

- Exact follow-on runtime state owners revealed after Terminal authority leaves `YiruRuntimeService`.
- Final domain package partition beyond the first mobile-consumed protocol/model cohort.
- Exact legacy Electron IPC methods that must remain transport-specific after request/response convergence.
- Whether historical maintenance scripts are externally invoked outside repository-visible entrypoints.

## Out of scope

- User-facing redesign or deliberate workflow changes.
- Dependency upgrades unrelated to enabling the refactor.
- Replacing Electron, Zustand, Expo, or the existing runtime transport stack.
- Broad test-coverage targets unrelated to the changed seams.
