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

