# Migrate the worthwhile Orca main delta

Label: wayfinder:map

## Destination

The worthwhile behaviors in Orca `817197fc3..1bd36ce04` have Yiru-native implementations: 25
correctness-critical behaviors land first, 13 recoverable/UX behaviors land in a later wave, 2
already-equivalent behaviors are verified without code migration, and 9 non-product or
architecture-inapplicable commits remain explicitly excluded. Completion requires one-to-one
coverage, focused regression evidence, cross-platform/SSH validation, an updated audit, and a clean
branch.

## Notes

- The upstream endpoint is fixed at `1bd36ce04bce11a103ea47a3b6452d481857f831` so the target cannot
  move during implementation. Run one small incremental audit before closure if Orca advances.
- The full 49-commit decision ledger is [triage.md](triage.md): 25 must migrate, 13 should migrate
  later, 2 need verification only, and 9 should not migrate.
- This session charts the work only. Future sessions implement one ticket at a time and finish each
  ticket with a coherent commit and focused review.
- Use at most three implementation subagents concurrently; the primary agent owns scope, conflict
  avoidance, integration, and final verification.
- Port behavior, not patches. Orca names, removed surfaces, and GitHub-only assumptions must be
  adapted to Yiru's domain model rather than copied.
- Follow `AGENTS.md`, `docs/style-guide.md`, and `docs/reference/git-compatibility.md`. Preserve SSH,
  WSL, Windows, Mobile, Web, Git 2.25, and GitLab behavior.
- Tests are required for concurrency, lifecycle, persistence, host isolation, and compatibility
  seams. Do not add low-value source-shape or presentation-only tests.
- Before each wave, confirm the worktree is clean and reserve the named ownership area. Subagents
  share one filesystem, so overlapping tickets never run in the same wave.

## Implementation frontier

### Must migrate

| Ticket | Behavior group | Orca commits | Blocked by |
| --- | --- | --- | --- |
| [01](issues/01-agent-session-resume-and-live-state.md) | Agent session resume and live state | `877bbdebf`, `739fce528`, `53222cc9c`, `cb19e7950` | — |
| [02](issues/02-workspace-persistence-and-hydration.md) | Workspace persistence and hydration | `253ccd29f`, `d8499fae1`, `c2371c0cd`, `143d2232b` | — |
| [03](issues/03-runtime-orchestration-and-process-lifecycle.md) | Runtime/orchestration/process lifecycle | `cd28da13f`, `dc18ba9cd`, `559f04d29` | — |
| [04](issues/04-ssh-wsl-and-windows-execution.md) | SSH, WSL, Windows, and packaging | `92696558c`, `c1d2c4be0`, `2cbcf03b0`, `26e48e415`, `1ace87c15`, `48a258d50` | — |
| [05](issues/05-mobile-and-web-runtime-behavior.md) | Mobile and Web runtime correctness | `6997bc40a`, `69d05b6e2`, `e651fe91c` | — |
| [06](issues/06-terminal-editor-and-sidebar-interactions.md) | Terminal/Web input and owner-correct file reveal | `eefded2a0`, `a4f42ad42`, `d50ea090c` | — |
| [07](issues/07-cli-settings-onboarding-and-worktree-policy.md) | Input persistence and Git branch policy | `a90ec540f`, `d1ccfcff4` | — |

### Should migrate after the core wave

| Ticket | Behavior group | Orca commits | Blocked by |
| --- | --- | --- | --- |
| [08](issues/08-optional-agent-and-status-polish.md) | Agent/status race and freshness polish | `dd642cb3e`, `eea1577dd` | 01 |
| [09](issues/09-optional-terminal-and-ui-polish.md) | CLI, input, terminal, sidebar, window, i18n polish | `108a2ad41`, `34caad787`, `2cf41ab86`, `4e670d3e4`, `b5ae776c3`, `fc181a849`, `1f29a33b2`, `1b5db4bc2` | 01, 06 |
| [10](issues/10-optional-workflow-and-worktree-polish.md) | Setup/onboarding and sparse-checkout polish | `deb2b50e7`, `9ced27eca`, `e3cc08f18` | 04, 07 |

### Closure

| Ticket | Behavior group | Blocked by |
| --- | --- | --- |
| [11](issues/11-cross-platform-validation-matrix.md) | Cross-platform validation, equivalence checks, and residual audit | 01–10 |
| [12](issues/12-integration-commits-and-audit-closure.md) | Integration, commits, and fixed-point audit closure | 11 |

## Execution waves

1. Core Wave 1: tickets 01, 04, and 05 in parallel. These cover the reported session/resume path,
   remote execution, and Mobile/Web without sharing high-conflict files.
2. Core Wave 2: tickets 02, 03, and 06 in parallel. Persistence/runtime authority remains separate
   from renderer terminal/file behavior.
3. Core Wave 3: ticket 07 while the primary agent reviews Core Waves 1–2. At this point all 25
   correctness-critical behaviors are present and can receive a core release gate.
4. Later Wave: tickets 08, 09, and 10 in parallel. These 13 behaviors are worthwhile but recoverable
   and must not delay fixes for session, data, permission, crash, or host-isolation failures.
5. Closure Wave: ticket 11 runs the full matrix; ticket 12 then lands the audit and final commit
   sequence.

## Decisions so far

<!-- Resolved tickets are indexed here with a one-line gist and link. -->

## Not yet specified

- Exact manual-device coverage available for Windows SSH relay, iOS, and Android. Ticket 11 must
  distinguish executable automated checks from explicitly recorded manual evidence.
- Any new Orca delta after `1bd36ce04`; it is intentionally deferred to the final incremental audit.

## Out of scope

- Reintroducing Tasks, Linear, Jira, Workspace Board, dashboard popout, or an Orca-only PR-files
  page.
- Marking GitHub's restricted `git@github.com` shell as a connected Yiru execution host. It cannot
  run Yiru relay/filesystem commands, so that would advertise a false capability.
- Orca CI-only, README/image, tests-only, or OpenSpec-document removal commits in this delta.
- Raw cherry-picking, broad refactors, dependency upgrades, or UI redesigns unrelated to the
  selected behaviors.
