# Spool Tailnet Worktree Sharing — Product Plan

**Status:** Implemented. Architecture recorded in [Spool Tailnet Worktree Sharing — Architecture](../2026-07-14-spool-tailnet-worktree-sharing-architecture.md).

**Goal:** Extend Yiru into Spool so people running Yiru Desktop on the same reachable Tailnet can discover one another, browse explicitly public worktrees, inspect every safely attributed session and the surrounding development state, and request temporary control of an entire remote worktree through the owner's existing Yiru runtime.

## Confirmed product model

Spool has two access levels and one visibility setting:

| State                                | What a remote Desktop can do                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private worktree                     | Discover nothing about the worktree or its sessions.                                                                                                    |
| Public Git worktree                  | Read all attributed sessions, terminals, files, diffs, scoped Git state, and sanitized Checks state in the worktree.                                    |
| Public folder-project workspace      | Read attributed sessions, terminals, and files; its sidebar exposes Explorer and Agents. `.git`, diffs, Git, and Checks are unavailable.                |
| Public worktree with a control grant | Mutate supported operations and create owner-side terminals or enabled agents for the current connection; a folder target still does not gain Git APIs. |

`Public` and `Private` belong only to worktrees. Projects and sessions do not have their own persisted visibility setting.

This includes the synthetic workspaces under a `Repo.kind = 'folder'` project: the root uses `repoId::path`, and additional instances use `repoId::path::workspace:<uuid>`. It does not include independent ProjectGroup-backed `FolderWorkspace` entries keyed as `folder:<uuid>`.

## Product principles

1. **Yiru remains the product shell.** Spool extends Yiru's sidebar, worktree, terminal, editor, source-control, agent, and runtime experiences instead of introducing a parallel UI.
2. **The Tailnet is the discovery boundary.** There is no Spool account, team creation flow, invitation, or central team service in the first version.
3. **Private by default.** A newly created worktree starts Private and reveals no metadata to another Desktop.
4. **Public is read-only.** A Public worktree exposes its complete read model, but every mutation remains blocked until its owner approves the current connection.
5. **Control is worktree-wide.** Approval is not scoped to one session or provider. It also permits owner-side terminal and enabled-agent creation for the current connection.
6. **Approval is ephemeral.** Every disconnect or application restart invalidates control and requires a new owner confirmation.
7. **Credentials never move.** Claude, Codex, Git, SSH, and other credentials remain on the owner's Desktop or execution host.
8. **No false sandbox promise.** A writable terminal is a remote shell. Spool must not claim that terminal commands are confined to the selected worktree.

## Tailnet discovery

When Yiru Desktop opens, Spool enumerates the peers visible to the local Tailscale client, then probes those peers for a running Yiru Desktop endpoint. The intended discovery input is the machine-readable peer list from `tailscale status --json`, not a brute-force scan of the `100.64.0.0/10` address range.

Only peers that satisfy all of the following appear:

- They are visible to the local Tailscale client.
- Tailnet policy and device settings allow a connection.
- Yiru Desktop is currently running and responds to the Spool probe.

There is no persistent offline roster. Closing Yiru Desktop or becoming unreachable removes that Desktop from the discovered list after reconciliation.

Tailscale provides peer discovery, reachability, and the private network path. Yiru's authenticated encrypted WebSocket RPC remains the application protocol. The implementation must not treat possession of a `100.x` address alone as identity.

The Tailscale CLI documents `status --json` as an automation-oriented detailed peer list while warning that its JSON shape is subject to change. Discovery must therefore parse defensively and fail closed when peer identity cannot be established.

## Desktop identity

The top-level sidebar item represents one running Desktop, not one merged person. If the same person runs Yiru on two machines, both appear independently:

```text
Alice · MacBook Pro
Alice · Linux workstation
```

This matches the real ownership of worktrees, active provider accounts, credentials, sessions, and runtime connections. Spool does not merge projects or quota across devices.

The display identity should come from verified Tailnet peer information plus the remote Yiru Desktop descriptor. A client-supplied display name alone is not an authorization identity.

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
Spool

▾ Alice · MacBook Pro
  ▾ yiru
    ▾ feature/session-sharing
        [Claude] Sharing UI
        [Codex]  RPC review
        [Claude] Initial exploration

▸ Alice · Linux workstation
```

Desktop and Project rows reuse Yiru's existing Project-header shell and disclosure affordance; Worktree rows reuse the existing Worktree-card surface. Spool does not define parallel hover backgrounds, arrow colors, or row chrome. The hierarchy uses the native anchors with one additional level for the Desktop: Desktop 10px, Project 20px, Worktree content 30px, and Session 48px. Hovering a Desktop opens a card with its Claude and Codex usage, rendered with the same provider segments and global used/remaining preference as the status bar. Quota does not consume permanent rows in the narrow navigation tree.

The owner still sees Private worktrees in their normal local Yiru sidebar. Another Desktop receives only Public worktrees, so a Private worktree's name, path, branch, sessions, counts, and activity do not cross the connection. An active control grant is rendered inside that owner's existing Worktree card as a compact requester row with a direct Revoke action; it is not collected in a separate global Spool panel.

Session rows are deliberately simple. Spool lists every terminal-backed session the owner can attribute to a Public worktree without adding `Live`, `Stopped`, or `Resumable` categories. The catalog discriminates plain terminals from agents; plain shells use the Terminal glyph, recognized agents retain their bounded provider label and glyph (including Gemini and OpenCode), and custom agents use a neutral agent identity. Selecting a live session attaches its terminal. Selecting a historical session does not open a separate transcript UI: once control is granted, the owner Desktop resumes the exact Claude or Codex session in that worktree and Spool immediately attaches the resulting terminal. Without control, the worktree request remains the only way to authorize that mutation. An unavailable session reports the observed failure only after the user tries to open it.

Opening a shared Worktree uses Yiru's normal workbench presentation. The center reuses the local Worktree pane and overflow-aware tab strip for terminals and agent sessions. Its `+` menu uses the same presentation as local tabs. Without control it is disabled with an explanatory tooltip; with control it offers `New Terminal` plus the agents that the owner actually has enabled and detected.

The remote tab strip remains select-only: it cannot close, rename, pin, drag, or persist remote tabs. Creation runs in the background on the owner Desktop and never changes the owner's active worktree, tab, or focus.

To keep paged history bounded, the strip keeps leading and recently selected sessions plus the active one; the virtualized left tree remains complete. The right sidebar reuses the ordinary Worktree frame, panel router, tab definitions, and panel presentation components. A Git worktree exposes Explorer, Agents, Source Control, and Checks; a folder worktree exposes Explorer and Agents. Explorer directories expand in place in the same tree; remote latency is represented by the ordinary row-level loading state rather than navigation to a second directory page.

Those tabs inject remote data/capability adapters into the ordinary top-level panel boundaries instead of mounting local data controllers against requester state. The adapters own checked IPC, stale-route handling, grant checks, and remote-only notices/actions; comparable toolbar, row, disclosure, virtual-list, section, check-list, notice, and surface presentation remains in ordinary right-sidebar Modules. Agents projects only agent-session entries from the Public paginated session catalog, and selecting a row opens that session's terminal in the center. Checks uses a checked owner-side RPC to return a sanitized read-only hosted-review projection, up to 256 check rows, truncation/detail availability, and the ordinary check list and activity status indicator. A provider failure is shown as unavailable rather than being confused with a branch that has no hosted review. None of these paths creates a fake local Repo or Worktree, discloses an owner path or credential, or routes work through requester-side filesystem, Git, AI Vault, or provider clients.

The UI follows `docs/STYLEGUIDE.md`: existing sidebar tokens, quiet monochrome chrome, shadcn primitives, existing list-row states, and color reserved for meaningful application state.

## Provider quota display

Each discovered Desktop publishes the observable rate-limit state for its current active Claude and Codex accounts.

When available, the Desktop hover card shows the same normalized fields and visual treatment Yiru's status bar already uses:

- Five-hour utilization and reset time.
- Seven-day utilization and reset time.
- A provider-reported unavailable state. Raw provider errors are stripped and folded into unavailable.

Spool does not expose account email addresses, account lists, authentication sources, credential paths, tokens, cookies, or raw provider responses. It does not invent a percentage or reset time when the provider does not report one.

If the owner changes the active account, the remote quota summary updates to represent the new active account. A granted controller uses the owner's active account, settings, and credentials at execution time, including when starting an agent.

## Worktree visibility

Every worktree has one persisted visibility value:

- **Private:** accessible only from its owner Desktop.
- **Public:** readable by other reachable Yiru Desktops on the same Tailnet.

Making a worktree Public automatically covers every current and future session inside that worktree, including owner-side sessions created at a remote controller's request. On first publication, the same confirmation bulk-attests legacy sessions that match the current execution host and worktree root; sessions do not need individual confirmation. A legacy record without safe worktree attribution remains undisclosed.

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
- Browse agent-session entries from the same Public paginated catalog in the Agents sidebar and select one into the center terminal.
- Watch terminal snapshots, scrollback, ANSI/TUI state, and realtime output.
- Browse files and read file contents.
- For Git worktrees, inspect diffs, the current worktree/index/HEAD status, HEAD history, current branch, upstream state, and sanitized hosted-review Checks state.

A folder-project workspace deliberately has no Git surface. Its file browser hides every `.git` entry at every depth and rejects every path containing a `.git` segment, case-insensitively. Its incarnation proof combines a hidden random root marker with the actual-host scope and stable directory `dev`/`ino`; Files also hides and rejects that marker. Renaming the same directory preserves the proof, while replacement or a copied marker does not. Synthetic workspaces from the same folder repo may share the same exact file root and proof, while cross-repo and ancestor/descendant overlaps remain unavailable.

The server is authoritative. Hiding or disabling controls is not sufficient: terminal input, file writes, Git mutations, process/session creation, and every other mutation must be rejected unless the current connection holds an approved grant for that worktree.

For a terminal-backed session, Spool reuses Yiru's remote terminal path:

1. Resolve the selected session to its terminal on the owner Desktop.
2. Subscribe through `terminal.subscribe` over the encrypted WebSocket RPC channel.
3. Render the initial serialized snapshot and scrollback.
4. Continue rendering realtime terminal output.
5. Keep terminal input disabled until control is granted.

The PTY, agent process, worktree, and credentials remain on the owner side. Tailscale carries the connection; it does not replace Yiru's terminal protocol.

## Requesting control

A Public worktree exposes one primary control request in its workspace header:

```text
Alice / yiru / feature-session-sharing                 [Request control]
```

The user requests the whole worktree once. Spool does not trigger separate approval prompts for terminal input, file edits, Git mutations, or individual sessions.

While a request is pending, the requester keeps read-only access. The owner receives an in-app approval surface that identifies the requesting Tailnet Desktop and the target worktree.

The confirmation must state the real security boundary:

```text
Allow Xinyao · MacBook to control this worktree?

They will be able to create terminals, start enabled agents,
send terminal input, modify files, run commands, and use your active agent accounts.
Terminal commands are not confined to this worktree.

                            [Deny] [Allow this connection]
```

There is no auto-approve or remembered approval in the first version.

## Granted control

After approval, the current connection receives the V1 mutable worktree capabilities defined below:

- Create a new owner-side terminal or start any agent that the owner Desktop currently exposes as enabled and detected for that execution host.
- Send input to every terminal/session in the worktree.
- Continue a historical Claude or Codex session in a new owner-side terminal; selecting and switching sessions remains requester-side navigation.
- Run commands from a granted owner-side terminal using the owner's environment and quota.
- Modify files.
- Stage, unstage, and commit through Spool's structured Source Control methods. Other Git commands remain available through the granted terminal shell.
- Use Spool's mutable terminal, file, diff, and reviewed Source Control controls for that worktree.

Structured creation is intentionally semantic. The requester sends only `New Terminal` or one owner-advertised agent identifier plus a `clientMutationId`. It cannot send a command, working directory, environment, path, prompt, account, or launch arguments. The owner resolves its worktree root, actual execution host, shell, settings, agent overrides, environment, and active credentials.

The created process and session belong to the owner's Public worktree, not to the requester. The creator attaches immediately through a connection-scoped alias, while the paged catalog later converges on the same session. Every other read-only viewer of that Public worktree can see it once it reaches the catalog.

Provider identity is learned only from an exact-worktree owner hook or initial actual-host snapshot. A bounded live-to-provider alias keeps the creator's `sessionRef` stable when the PTY later becomes a historical Claude/Codex record, including paired-runtime short-lived agents. Lost proof hides a record; Spool never repairs an ordinary catalog page by guessing from its current CWD.

V1 still exposes no remote tab close, rename, pin, drag, or move operation. It also exposes no structured checkout, merge, rebase, fetch, pull, or push. A granted terminal remains an ordinary owner-side shell, but the UI must not imply that unsupported GUI methods exist.

Each create carries a connection- and worktree-scoped `clientMutationId`. Repeating the same ID on that connection returns the original in-flight or completed result and never spawns twice. If the response becomes uncertain after the spawn boundary, Spool reports `outcome_unknown`; it may refresh the catalog but never automatically retries the mutation.

The owner retains exclusive authority to:

- Change the worktree between Public and Private.
- Approve or deny control requests.
- Revoke a granted connection.
- Delete the worktree.

Remote work never creates a requester-owned worktree or migrates a session. A remotely requested terminal or agent is still created and owned inside the owner's existing worktree on its existing execution host.

This rule must also hold when the worktree is backed by WSL, SSH, or another Yiru runtime. The owner Desktop remains the sharing gateway and routes reads and mutations to the actual execution host; Spool must not assume that the worktree path or agent process is local to the owner Desktop.

## No concurrency coordination

Spool does not introduce a controller lease, input lock, editing lock, queue, ownership handoff, or conflict warning.

The owner and any granted remote connections may operate concurrently. They may type into the same terminal, create several terminals or agents, modify the same file, run conflicting Git commands, or consume provider quota at the same time. Resulting races and conflicts are accepted behavior for the first version.

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
- Either Yiru Desktop exits or restarts.
- The worktree is deleted.

After a network reconnect, a Public worktree may restore its read-only state automatically, but control does not return. The requester must select `Request control` again and the owner must explicitly approve again.

While control is active, the owner sees the requesting Desktop and a direct revocation action in the worktree UI:

```text
feature/session-sharing
Xinyao · MacBook has access                          [Revoke]
```

Revocation prevents future mutations. It does not close a terminal or agent already created, and cannot undo commands, file changes, Git operations, or provider usage. Those owner-owned sessions remain visible under the Public worktree and the owner can manage them locally. Controlling them after reconnect requires a new approval.

## Security boundary

Spool is designed for mutually trusted people sharing a Tailnet. Tailnet membership and reachability are not substitutes for server-side authorization, but they define the first-version discovery population.

Public access is enforced as read-only. Granted access is intentionally powerful. Because Yiru terminals are ordinary shells, a granted user can leave the selected directory, inspect other paths available to the owner's system user, start background processes, and execute destructive commands. Without a sandbox, `worktree control` is a product context rather than an operating-system security boundary.

Owner, paired-runtime, and renderer boundaries parse the same strict execution-result schemas. A downstream result cannot cross a wider relay schema and then fail under a narrower UI schema; malformed mutation acknowledgements after admission are treated as `outcome_unknown`.

Provider, Git, SSH, and system credentials stay on the host, but a granted shell may exercise the authority those credentials provide. Product copy and approval surfaces must state this without implying confinement that does not exist.

## End-to-end acceptance scenario

1. Alice and Xinyao run Yiru Desktop on separate machines reachable in the same Tailnet.
2. Each Desktop discovers the other without a Spool account or invitation.
3. Xinyao sees one sidebar item per Alice Desktop and the observable active Claude/Codex quota for each.
4. Alice makes one Yiru worktree Public. Her other worktrees remain undisclosed.
5. Xinyao expands `Alice Desktop → yiru → public worktree` and sees every session attributed to that worktree.
6. Xinyao opens sessions, watches terminals, reads files, inspects diffs, and inspects Git state; mutation attempts are rejected by Alice's host.
7. Xinyao selects `Request control` on the worktree.
8. Alice sees the requesting Desktop, the worktree, and the remote-shell warning, then approves the current connection.
9. The shared `+` menu now offers `New Terminal` and Alice's enabled/detected agents. Xinyao creates both without changing Alice's focused tab, then immediately attaches to the returned terminal.
10. The new sessions belong to Alice's Public worktree and appear through the paged catalog for another read-only viewer. Xinyao also continues an existing Claude session and uses Alice's active quota.
11. Repeating one `clientMutationId` produces no second process. A post-spawn response loss reports `outcome_unknown`, refreshes the catalog, and never automatically retries.
12. The same creation behavior holds for local, WSL, SSH, and paired runtime worktrees without a local fallback or requester-triggered route prompt.
13. Alice and Xinyao may operate concurrently; Spool does not arbitrate conflicts.
14. Alice selects `Revoke`, or either Desktop disconnects. Xinyao immediately loses mutation access, but already-created processes continue on Alice's host.
15. After reconnecting, Xinyao can browse those sessions read-only but must request and receive approval again before controlling or creating anything.

## Existing Yiru capabilities to reuse

- AI Vault and agent session discovery.
- Workspace session tabs and terminal handle resolution.
- The local tab `+` menu presentation and owner-side terminal/agent launch paths.
- Runtime routing for local, WSL, SSH, and paired execution hosts.
- Encrypted WebSocket RPC.
- `terminal.subscribe`, serialized snapshots, scrollback, streaming output, input, resize, and terminal attachment binding.
- Remote file, diff, Git, Checks, and worktree reads.
- The ordinary Worktree sidebar frame, panel router, Explorer rows/toolbars, Source Control sections/lists, Checks list, activity-tab definitions, and status-indicator presentation, backed by narrow Spool remote adapters.
- Existing terminal, editor, source-control, and worktree UI.
- Existing Claude and Codex normalized rate-limit state.
- Existing E2EE framing, heartbeat, terminal resync, and execution-host routing where they preserve the connection-scoped grant rules above.

## Proposed delivery slices

### Slice 1: Local visibility model and static UI

- Persist Public/Private on worktrees, defaulting every new worktree to Private.
- Add worktree visibility actions and project-level bulk actions.
- Add the Desktop → Project → Worktree → Sessions sidebar hierarchy by reusing the native Project header, Worktree card, and disclosure presentation seams.
- Prototype the Public read-only header, `Request control`, approval, active-control, and revocation states.
- Validate density and hierarchy against `docs/STYLEGUIDE.md` before networking work.

### Slice 2: Tailnet discovery and read-only sharing

- Enumerate Tailnet peers and probe for running Yiru Desktops on macOS, Linux, and Windows.
- Authenticate discovered peer identity and establish encrypted RPC connections.
- Publish active-account quota summaries and Public worktree metadata only.
- Support read-only sessions, terminal streaming, files, and the remote Agents projection for every supported target; add diffs, Git state, and sanitized Checks for Git worktrees.
- Prove that every mutation is rejected server-side without a grant.
- Route SSH, WSL, and runtime-backed worktrees through the owner Desktop correctly.

### Slice 3: Connection-scoped control

- Add worktree-level control requests and owner approval.
- Bind approved capability to the exact current connection and worktree.
- Unlock owner-side `New Terminal`, semantic enabled-agent launch, terminal input, file mutations, structured Git stage/unstage/commit, and proven Claude/Codex continuation.
- Accept only semantic launch identifiers; resolve commands, roots, environment, settings, credentials, and execution routes on the owner.
- Return a connection-scoped attachment immediately, then converge it with the paged session catalog without duplicate tabs.
- Deduplicate create mutations by `clientMutationId` and never automatically retry `outcome_unknown`.
- Reuse the owner's active sessions, authentication, and quota across local, WSL, SSH, and paired runtime targets.
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
- Creating requester-owned remote worktrees or sessions, or moving owner sessions to the requester. Remotely requested owner-side sessions inside the Public worktree are supported.
- Sharing independent ProjectGroup-backed `FolderWorkspace` entries keyed as `folder:<uuid>`; `Repo.kind = 'folder'` synthetic workspaces are supported.
- Browser profiles/panes, cookies, hosted-review or issue-tracker mutations, automations, emulator/computer control, settings, account switching, and SSH/runtime administration.
- Remote tab close, rename, pin, drag, or move operations.
- Invented quota estimates when provider usage data is unavailable.
- Session lifecycle labels or status-based grouping in the sidebar.
- Replacing Yiru RPC with a Tailscale-specific terminal protocol.

## Architecture resolution

The discovery Adapter, dedicated ingress, Tailnet/E2EE identity binding, opaque resource references, default-deny RPC registry, visibility durability, execution-host routing, and reconciliation semantics are resolved in [Spool Tailnet Worktree Sharing — Architecture](../2026-07-14-spool-tailnet-worktree-sharing-architecture.md).
