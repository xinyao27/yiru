# Extract Terminal session authority

Type: task
Status: resolved
Blocked by: 01

## Question

Move mutable Terminal graph, handle, driver, layout, subscription, recovery, and cleanup ownership behind one deep module while preserving all characterized behavior. Rewire Electron IPC, runtime RPC, relay, SSH, daemon, renderer, mobile, and web paths as adapters and delete superseded ownership.

## Comments

### Ownership decision

`TerminalSessionAuthority` is the sole owner of live Terminal session state. Its internal modules
separate graph/window recovery and handle indexes, PTY records, headless emulator hydration,
subscription generations, event/driver listeners, serialized layout/fit state, mobile presence and
input-floor reservations, remote-desktop width ownership, and terminal/message waiters. PTY exit now
uses one authority cleanup operation for every publicly observable driver/layout/fit/presence/timer
state.

`YiruRuntimeService` remains the compatibility facade and workflow coordinator for this ticket; it
no longer declares the superseded maps, epochs, queues, or cleanup registries. Electron IPC and
runtime RPC call that facade. Native, SSH relay, and daemon providers retain only transport/process
state and deliver data/exit/resize through it. The renderer driver cache is explicitly a UI
projection; mobile and web clients consume RPC events and do not own main-side session truth.

The extraction removes 1,235 lines from `yiru-runtime.ts` while keeping every new
project-owned source file within the repository max-lines contract and using domain-specific
kebab-case names.

Authority queries return detached snapshots instead of mutable references. Steady-state PTY
output, title, and waiter updates use one synchronous authority transaction to avoid cloning on the
hot path, while asynchronous foreground-agent probes commit through a narrow command that rechecks
the current PTY state before writing.

### Verification

- Terminal characterization and real provider adapters: 2 files, 8 tests passed.
- Full suite: 11 files, 27 tests passed.
- Workspace typecheck, full non-fixing lint, format check, and max-lines ratchet passed. Full lint
  retains the pre-existing `keyboard-handlers.ts` exhaustive-deps warning tracked by ticket 09.
- Repository contracts reached the committed skill-manifest history check; local verification lacks
  historical prerelease tags, matching the known Ticket 01 environment diagnostic.

### Review

- Standards review: no findings; snapshot ownership, narrow asynchronous commits, and PTY hot-path
  transactions satisfy the repository constraints.
- Specification review: no findings; graph recovery, foreground probing, output/title/wait updates,
  adapter behavior, and cleanup semantics satisfy Ticket 02.
