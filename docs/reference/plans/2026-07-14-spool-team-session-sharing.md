# Spool Tailnet Worktree Sharing — Product Plan

**Status:** Implemented. Architecture recorded in [Spool Tailnet Worktree Sharing — Architecture](../2026-07-14-spool-tailnet-worktree-sharing-architecture.md).

**Goal:** Extend Orca into Spool so people running Orca Desktop on the same reachable Tailnet can discover one another, browse explicitly public worktrees, inspect every safely attributed session and the surrounding development state, and request temporary control of an entire remote worktree through the owner's existing Orca runtime.

## Confirmed product model

Spool has two access levels and one visibility setting:

| State                                | What a remote Desktop can do                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Private worktree                     | Discover nothing about the worktree or its sessions.                                         |
| Public worktree                      | Read all attributed sessions, terminals, files, diffs, and scoped Git state in the worktree. |
| Public worktree with a control grant | Mutate terminals, sessions, files, and Git state for the lifetime of the current connection. |

`Public` and `Private` belong only to worktrees. Projects and sessions do not have their own persisted visibility setting.

## Product principles

1. **Orca remains the product shell.** Spool extends Orca's sidebar, worktree, terminal, editor, source-control, agent, and runtime experiences instead of introducing a parallel UI.
2. **The Tailnet is the discovery boundary.** There is no Spool account, team creation flow, invitation, or central team service in the first version.
3. **Private by default.** A newly created worktree starts Private and reveals no metadata to another Desktop.
4. **Public is read-only.** A Public worktree exposes its complete read model, but every mutation remains blocked until its owner approves the current connection.
5. **Control is worktree-wide.** Approval is not scoped to one session or one provider. It unlocks the remote worktree experience for the current connection.
6. **Approval is ephemeral.** Every disconnect or application restart invalidates control and requires a new owner confirmation.
7. **Credentials never move.** Claude, Codex, Git, SSH, and other credentials remain on the owner's Desktop or execution host.
8. **No false sandbox promise.** A writable terminal is a remote shell. Spool must not claim that terminal commands are confined to the selected worktree.

## Tailnet discovery

When Orca Desktop opens, Spool enumerates the peers visible to the local Tailscale client, then probes those peers for a running Orca Desktop endpoint. The intended discovery input is the machine-readable peer list from `tailscale status --json`, not a brute-force scan of the `100.64.0.0/10` address range.

Only peers that satisfy all of the following appear:

- They are visible to the local Tailscale client.
- Tailnet policy and device settings allow a connection.
- Orca Desktop is currently running and responds to the Spool probe.

There is no persistent offline roster. Closing Orca Desktop or becoming unreachable removes that Desktop from the discovered list after reconciliation.

Tailscale provides peer discovery, reachability, and the private network path. Orca's authenticated encrypted WebSocket RPC remains the application protocol. The implementation must not treat possession of a `100.x` address alone as identity.

The Tailscale CLI documents `status --json` as an automation-oriented detailed peer list while warning that its JSON shape is subject to change. Discovery must therefore parse defensively and fail closed when peer identity cannot be established.

## Desktop identity

The top-level sidebar item represents one running Desktop, not one merged person. If the same person runs Orca on two machines, both appear independently:

```text
Alice · MacBook Pro
Alice · Linux workstation
```

This matches the real ownership of worktrees, active provider accounts, credentials, sessions, and runtime connections. Spool does not merge projects or quota across devices.

The display identity should come from verified Tailnet peer information plus the remote Orca Desktop descriptor. A client-supplied display name alone is not an authorization identity.

## Sidebar hierarchy

The left sidebar uses this hierarchy:

```text
Desktop
└─ Project
   └─ Worktree
      └─ Sessions
```

Example:

```text
SPOOL

▾ Alice · MacBook Pro
  Claude   5h 32% used · 7d 16% used
  Codex    5h 68% used · resets in 2h

  ▾ orca
    ▾ feature/session-sharing                 Public
        Claude · Sharing UI
        Codex · RPC review
        Claude · Initial exploration

▸ Alice · Linux workstation
  Claude   Usage unavailable
  Codex    5h 14% used
```

The owner still sees Private worktrees in their normal local Orca sidebar. Another Desktop receives only Public worktrees, so a Private worktree's name, path, branch, sessions, counts, and activity do not cross the connection.

Session rows are deliberately simple. Spool lists every session the owner can attribute to a Public worktree without adding `Live`, `Stopped`, or `Resumable` categories to the navigation. Selecting a session asks the host to resolve it and renders the result in the requester's workspace. If a live terminal exists, the workspace attaches to it; a historical session opens read-only until control is granted. An unavailable session reports the observed failure only after the user tries to open it.

The UI follows `docs/STYLEGUIDE.md`: existing sidebar tokens, quiet monochrome chrome, shadcn primitives, existing list-row states, and color reserved for meaningful application state.

## Provider quota display

Each discovered Desktop publishes the observable rate-limit state for its current active Claude and Codex accounts.

When available, Spool can show the same normalized fields Orca already uses:

- Five-hour utilization and reset time.
- Seven-day utilization and reset time.
- A provider-reported unavailable or error state.

Spool does not expose account email addresses, account lists, authentication sources, credential paths, tokens, cookies, or raw provider responses. It does not invent a percentage or reset time when the provider does not report one.

If the owner changes the active account, the remote quota summary updates to represent the new active account. A granted remote controller uses whichever account is active on the owner's Desktop at execution time.

## Worktree visibility

Every worktree has one persisted visibility value:

- **Private:** accessible only from its owner Desktop.
- **Public:** readable by other reachable Orca Desktops on the same Tailnet.

Making a worktree Public automatically covers every current and future session inside that worktree. On first publication, the same confirmation bulk-attests legacy sessions that match the current execution host and worktree root; sessions do not need individual confirmation. A legacy record that has no safe worktree attribution remains undisclosed rather than being guessed from an ambiguous path.

Projects do not persist a visibility value. Their context menu provides bulk operations over the worktrees that exist at the time of the action:

- `Make all worktrees public`
- `Make all worktrees private`

The bulk action does not become a policy for future worktrees. Every later worktree still starts Private.

V1 allows at most 128 Public worktrees on one owner Desktop. Publishing a worktree or running a project bulk action that would cross the limit fails before any visibility change, so the remote catalog never silently omits a Public worktree.

The worktree context menu provides the direct actions:

- `Make public`
- `Make private`

Making a worktree Public must warn the owner that all existing session history, terminal scrollback, and future terminal output becomes readable. Terminal history may already contain content produced outside the worktree, so Public cannot promise path-based redaction of past output.

Making a worktree Private immediately removes it from remote discovery, ends its read subscriptions, and revokes any active control grant.

## Public read-only experience

Opening a Public worktree without a grant provides the complete V1 read-only worktree workspace:

- List and open every session attributed to the worktree.
- Watch terminal snapshots, scrollback, ANSI/TUI state, and realtime output.
- Browse files and read file contents.
- Inspect diffs.
- Inspect the current worktree/index/HEAD status, diffs, HEAD history, current branch, and upstream state.

The server is authoritative. Hiding or disabling controls in the remote renderer is not sufficient: terminal input, file writes, Git mutations, process creation, session creation, and every other mutation must be rejected unless the current connection holds an approved grant for that worktree.

For a terminal-backed session, Spool reuses Orca's remote terminal path:

1. Resolve the selected session to its terminal on the owner Desktop.
2. Subscribe through `terminal.subscribe` over the encrypted WebSocket RPC channel.
3. Render the initial serialized snapshot and scrollback.
4. Continue rendering realtime terminal output.
5. Keep terminal input disabled until control is granted.

The PTY, agent process, worktree, and credentials remain on the owner side. Tailscale carries the connection; it does not replace Orca's terminal protocol.

## Requesting control

A Public worktree exposes one primary control request in its workspace header:

```text
Alice / orca / feature-session-sharing                 [Request control]
```

The user requests the whole worktree once. Spool does not trigger separate approval prompts for terminal input, file edits, Git mutations, or individual sessions.

While a request is pending, the requester keeps read-only access. The owner receives an in-app approval surface that identifies the requesting Tailnet Desktop and the target worktree.

The confirmation must state the real security boundary:

```text
Allow Xinyao · MacBook to control this worktree?

They will be able to send terminal input, modify files,
run commands, and use your Claude/Codex accounts.
Terminal commands are not confined to this worktree.

                            [Deny] [Allow this connection]
```

There is no auto-approve or remembered approval in the first version.

## Granted control

After approval, the current connection receives the V1 mutable worktree capabilities defined below:

- Send input to every terminal/session in the worktree.
- Continue a historical Claude or Codex session in a new owner-side terminal; selecting and switching sessions remains requester-side navigation.
- Run commands, including starting another Claude or Codex process, from a granted owner-side terminal using the owner's environment and quota.
- Modify files.
- Stage, unstage, and commit through Spool's structured Source Control methods. Other Git commands remain available through the granted terminal shell.
- Use Spool's mutable terminal, file, diff, and reviewed Source Control controls for that worktree.

V1 does not expose separate structured RPCs for creating, renaming, or closing sessions, or for checkout, merge, rebase, fetch, pull, and push. A granted terminal is an ordinary owner-side shell and can run those commands, but the UI and protocol must not imply that dedicated worktree-bound GUI methods exist when they do not.

The owner retains exclusive authority to:

- Change the worktree between Public and Private.
- Approve or deny control requests.
- Revoke a granted connection.
- Delete the worktree.

The remote work does not create a requester-owned worktree or migrate a session. The requester continues the owner's existing sessions in the owner's existing worktree, on the execution host already used by that worktree.

This rule must also hold when the worktree is backed by WSL, SSH, or another Orca runtime. The owner Desktop remains the sharing gateway and routes reads and mutations to the actual execution host; Spool must not assume that the worktree path or agent process is local to the owner Desktop.

## No concurrency coordination

Spool does not introduce a controller lease, input lock, editing lock, queue, ownership handoff, or conflict warning.

The owner and any granted remote connections may operate the worktree concurrently. They may type into the same terminal, modify the same file, run conflicting Git commands, or consume provider quota at the same time. Resulting terminal races, file conflicts, and Git conflicts are accepted behavior for the first version.

This is a deliberate non-goal, not an implied safety guarantee.

## Grant lifetime and revocation

A grant is scoped to exactly:

```text
requesting Tailnet Desktop + owner Desktop + worktree + current connection
```

It is never persisted. The following events immediately remove write capability:

- The owner selects `Revoke`.
- The owner makes the worktree Private.
- Either side's WebSocket connection closes, including a transient network loss.
- Either Orca Desktop exits or restarts.
- The worktree is deleted.

After a network reconnect, a Public worktree may restore its read-only state automatically, but control does not return. The requester must select `Request control` again and the owner must explicitly approve again.

While control is active, the owner sees the requesting Desktop and a direct revocation action in the worktree UI:

```text
feature/session-sharing
Xinyao · MacBook has access                          [Revoke]
```

Revocation prevents future mutations. It cannot undo commands, processes, file changes, Git operations, or provider usage already initiated by the requester.

## Security boundary

Spool is designed for mutually trusted people sharing a Tailnet. Tailnet membership and reachability are not substitutes for server-side authorization, but they define the first-version discovery population.

Public access is enforced as read-only. Granted access is intentionally powerful. Because Orca terminals are ordinary shells, a granted user can leave the selected directory, inspect other paths available to the owner's system user, start background processes, and execute destructive commands. Without a sandbox, `worktree control` is a product context rather than an operating-system security boundary.

Provider, Git, SSH, and system credentials stay on the host, but a granted shell may exercise the authority those credentials provide. Product copy and approval surfaces must state this without implying confinement that does not exist.

## End-to-end acceptance scenario

1. Alice and Xinyao run Orca Desktop on separate machines reachable in the same Tailnet.
2. Each Desktop discovers the other without a Spool account or invitation.
3. Xinyao sees one sidebar item per Alice Desktop and the observable active Claude/Codex quota for each.
4. Alice makes one Orca worktree Public. Her other worktrees remain undisclosed.
5. Xinyao expands `Alice Desktop → orca → public worktree` and sees every session attributed to that worktree.
6. Xinyao opens sessions, watches terminals, reads files, inspects diffs, and inspects Git state; mutation attempts are rejected by Alice's host.
7. Xinyao selects `Request control` on the worktree.
8. Alice sees the requesting Desktop, the worktree, and the remote-shell warning, then approves the current connection.
9. Xinyao continues Alice's existing Claude session, edits Alice's worktree, runs commands, and uses Alice's active Claude quota.
10. Alice and Xinyao may operate concurrently; Spool does not arbitrate conflicts.
11. Alice selects `Revoke`, or either Desktop disconnects. Xinyao immediately loses mutation access.
12. After reconnecting, Xinyao can browse the Public worktree read-only but must request and receive approval again before making another change.

## Existing Orca capabilities to reuse

- AI Vault and agent session discovery.
- Workspace session tabs and terminal handle resolution.
- Runtime routing for local, WSL, SSH, and paired execution hosts.
- Encrypted WebSocket RPC.
- `terminal.subscribe`, serialized snapshots, scrollback, streaming output, input, and resize.
- Remote file, diff, Git, and worktree reads.
- Existing terminal, editor, source-control, and worktree UI.
- Existing Claude and Codex normalized rate-limit state.
- Existing E2EE framing, heartbeat, terminal resync, and execution-host routing where they preserve the connection-scoped grant rules above.

## Proposed delivery slices

### Slice 1: Local visibility model and static UI

- Persist Public/Private on worktrees, defaulting every new worktree to Private.
- Add worktree visibility actions and project-level bulk actions.
- Add the Desktop → Project → Worktree → Sessions sidebar hierarchy using realistic static data.
- Prototype the Public read-only header, `Request control`, approval, active-control, and revocation states.
- Validate density and hierarchy against `docs/STYLEGUIDE.md` before networking work.

### Slice 2: Tailnet discovery and read-only sharing

- Enumerate Tailnet peers and probe for running Orca Desktops on macOS, Linux, and Windows.
- Authenticate discovered peer identity and establish encrypted RPC connections.
- Publish active-account quota summaries and Public worktree metadata only.
- Support read-only sessions, terminal streaming, files, diffs, and Git state.
- Prove that every mutation is rejected server-side without a grant.
- Route SSH, WSL, and runtime-backed worktrees through the owner Desktop correctly.

### Slice 3: Connection-scoped control

- Add worktree-level control requests and owner approval.
- Bind approved capability to the exact current connection and worktree.
- Unlock remote terminal input, file mutations, structured Git stage/unstage/commit, and
  continuing a proven existing Claude/Codex session in an owner-side terminal.
- Reuse the owner's active Claude/Codex sessions, authentication, and quota.
- Add explicit revoke, Private transition, disconnect, restart, and deletion invalidation.
- Verify that reconnect restores only Public read access and always requires another confirmation.

## Explicitly out of scope for the first version

- Spool accounts, teams, invitations, or a central control plane.
- Public internet discovery or unauthenticated links.
- Merging multiple Desktops belonging to one person.
- Session-level or project-level visibility.
- Per-member Public visibility rules.
- Automatically making future worktrees Public after a project bulk action.
- Persisted, expiring, provider-specific, or session-specific grants.
- Auto-approval after a previously approved connection.
- Controller leases, conflict detection, input arbitration, or collaborative editing.
- Sandboxing terminal commands to the selected worktree.
- Moving credentials, PTYs, sessions, or worktrees to the requester's machine.
- Creating requester-owned remote worktrees or sessions as part of control.
- Sharing `FolderWorkspace` entries before they have a durable cross-platform incarnation identity.
- Browser profiles/panes, cookies, hosted-review or issue-tracker mutations, automations, emulator/computer control, settings, account selection, and SSH/runtime administration.
- Invented quota estimates when provider usage data is unavailable.
- Session lifecycle labels or status-based grouping in the sidebar.
- Replacing Orca RPC with a Tailscale-specific terminal protocol.

## Architecture resolution

The discovery Adapter, dedicated ingress, Tailnet/E2EE identity binding, opaque resource references, default-deny RPC registry, visibility durability, execution-host routing, and reconciliation semantics are resolved in [Spool Tailnet Worktree Sharing — Architecture](../2026-07-14-spool-tailnet-worktree-sharing-architecture.md).
