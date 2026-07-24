# Remove implementation-detail tests

Type: task
Status: resolved
Blocked by: 03

## Question

Which repository tests and verification scripts merely mirror class names, source strings, exact
registry counts, or other implementation details without protecting observable behavior? Delete
those checks while preserving executable product, protocol, migration, compatibility, release, and
failure-recovery contracts.

## Comments

### Deletion criteria

A check is removed when its failure only says that source was rearranged or renamed. Checks remain
when they exercise a module interface, parse or execute a real platform adapter, validate a built
artifact, enforce a persisted/protocol contract, or cover a user-observable state transition.

### Audit result

The repository now has 13 conventional test files and 30 cases. None assert class names, DOM text,
source/file/export existence, snapshots, or generated implementation text. The remaining cases
cover observable behavior, migrations, protocols, races, persistence compatibility, or cleanup.

Removed checks:

- The 399-line styled-scrollbar verifier, which parsed JSX to require specific class literals, plus
  its package script and PR workflow invocations.
- The native provider `source.includes(...)` mirror, including checks that passed only when exact
  comments and implementation snippets survived. Native syntax/import/parse, Windows handshake,
  and macOS codesign verification remain executable.
- The loader-style registry case that asserted a list-built Set contained the same list and pinned
  the number of Thinking Orb styles. The persisted unknown-value fallback case remains.

Retained repository gates enforce documented design-token and max-lines policies, localization and
generated-artifact consistency, actual packaged assets/types/signatures, executable CLI/web/daemon
smoke behavior, and telemetry values inside real `app.asar` artifacts.

### Verification

- Loader-style behavior: 1 file, 1 test passed.
- Full suite: 13 files, 30 tests passed.
- Workspace typecheck, full non-fixing lint, format check, max-lines ratchet, script syntax, and
  `git diff --check` passed. Full lint retains the pre-existing `keyboard-handlers.ts`
  exhaustive-deps warning tracked by ticket 09.
- The retained native verifier passed Linux syntax parsing and skipped unavailable Linux/Windows
  adapters on macOS; its final codesign check requires the unbuilt macOS helper app.
- Repository contracts reached the committed skill-manifest history check; local verification lacks
  historical release tags, matching the known Ticket 01 environment diagnostic.

### Review

- Standards review: no findings. The scrollbar style remains a documented hard rule; no repository
  instruction requires preserving the deleted source-literal gate as its enforcement mechanism.
- Specification review: no findings; all three high-confidence implementation-detail categories
  were removed without deleting executable behavior, artifact, compatibility, or release checks.
