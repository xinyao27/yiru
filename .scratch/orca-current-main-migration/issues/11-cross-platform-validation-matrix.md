# Run the cross-platform and provider validation matrix

Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10

## Question

Does the integrated migration satisfy every selected behavior across providers, clients, execution
hosts, and operating systems while preserving the nine explicit exclusions?

## Matrix

- Providers: Claude, Codex, Pi/OMP, OpenCode, plus normalized missing-provider snapshot paths.
- Clients: desktop renderer, headless runtime, Mobile, and HTTP Web.
- Hosts: native macOS/Linux/Windows, pinned WSL distro, POSIX SSH, Windows SSH relay, and disconnected
  SSH. Verify that GitHub's restricted shell remains ineligible as an execution host.
- Persistence/lifecycle: cold restore, reconnect, pre-hydration events, project deletion, stale
  snapshots, last-PTY exit, process-tree termination, and mixed-version Mobile protocol.
- UI/input: macOS occlusion and IME, Linux middle-click selection, Windows/HTTP clipboard paste,
  terminal search/wheel, virtual sidebar geometry, and owner-qualified Markdown line links.
- Source control: Git 2.25 baseline, sparse checkout disabled/enabled, local/SSH branch prefixes, and
  pinned-WSL `gh`/`glab` fallback.
- Packaging: unpacked Windows artifact inspection for duplicate/broken shims.

## Equivalence checks

- `5a1ca2426`: supported desktop/Web adapters always normalize the complete provider snapshot shape.
- `1367094bb`: the URL tooltip remains anchored at pane bottom-left using Yiru's existing styling.
- `ec04827b3`: use the workspace-reopen scenario as a regression for ticket 01 only if it protects
  the changed ownership seam; do not port the tests-only commit mechanically.

## Acceptance

- Build an explicit 49-row closure ledger with evidence for 25 must, 13 later, 2 verify, and 9
  excluded decisions; no row may be missing or counted twice.
- Run focused tests from tickets 01–10, the repository test suite, typecheck, non-fixing lint/format
  checks, repository contracts, max-lines ratchet, localization verification, and relevant Web/
  Windows build or unpack checks.
- Record unavailable physical/platform coverage honestly. Create a narrowly scoped follow-up ticket
  when required runtime evidence cannot be obtained.

## Commit boundary

Verification is normally commit-free. Commit only new high-value tests/fixtures or bounded fixes,
each reviewed as its own change.
