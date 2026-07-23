# Deepen persisted-state codec

Type: task
Status: resolved
Blocked by: 05

## Question

Keep one atomic durable-state authority while separating versioned decode/migrate/normalize codecs, domain mutations, and notification callbacks from disk encryption/backup/write implementation. Preserve every existing migration and persisted-state compatibility case with focused characterization tests.

## Comments

### Ownership decision

`Store` remains the single atomic in-memory `PersistedState` authority and public facade. Durable
file mechanics now belong to `DurableStateFile`, the GitHub cache sidecar belongs to
`GitHubCacheFile`, and versioned decode/migrate/normalize logic is composed from concrete
persisted-state codec modules. Settings and UI updates use pure domain mutation functions; a
notification publisher owns subscriber sets and publish policy after Store commits a mutation.

Durable reads treat decrypt, JSON parse, semantic decode, and backup recovery as one transaction.
An invalid-but-parseable primary therefore falls back to a healthy backup, while an unrecoverable
existing file retains the existing-user telemetry cohort without incorrectly completing onboarding.

### Resolution

- Reduced `persistence.ts` by more than 2,300 lines while preserving its atomic Store facade.
- Extracted encryption, atomic writes, backup rotation/recovery, generation fencing, flush/freeze,
  and GitHub cache sidecar persistence from domain state behavior.
- Split persisted-state decoding into versioned and domain-specific codecs for settings, UI,
  onboarding, sessions, SSH, telemetry, terminal state, and workspace lineage.
- Moved settings/UI normalization and mutation into pure domain modules and moved subscriber
  ownership plus notification gating into a dedicated publisher.
- Preserved legacy migrations, explicit false values, corrupt-session isolation, onboarding and
  telemetry cohort semantics, SSH compatibility fields, and terminal scrollback/TUI migrations.

### Verification

- Full suite: 16 files, 43 behavioral tests passed; the 13 new focused tests cover persistence
  compatibility, recovery, and mutation semantics rather than implementation existence.
- Desktop node/CLI/web typecheck, non-fixing lint, formatting, `git diff --check`, max-lines ratchet,
  localization catalog/coverage, and switch-exhaustiveness checks passed.
- Electron Vite production build passed. Existing ineffective-dynamic-import and CSS `::highlight`
  warnings remain unrelated to this ticket.
- Repository contracts pass until the known local prerequisite: the worktree lacks complete
  historical `yiru-cli` release tags required by the skill bundle manifest check.

### Review

- Specification review confirmed recovery, onboarding/telemetry, workspace-session warning, and
  settings/UI mutation semantics with no residual findings.
- Standards review confirmed module boundaries, platform/SSH safety, naming, lint, and test value;
  its sole closure finding renamed `GithubCacheFile` to the repository-standard `GitHubCacheFile`.

