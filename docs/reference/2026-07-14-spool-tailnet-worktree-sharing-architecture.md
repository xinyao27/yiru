# Spool Tailnet Worktree Sharing — Architecture

**Date:** 2026-07-14

**Status:** Implemented

**Product model:** [Spool Tailnet Worktree Sharing — Product Plan](./plans/2026-07-14-spool-team-session-sharing.md)

## Outcome

Spool is a Tailnet-only remote-worktree capability inside Orca Desktop. Each Desktop discovers other running Desktops, receives a server-produced projection of their Public worktrees, and opens those worktrees through a dedicated encrypted connection. Public access is read-only. An owner can grant one physical connection mutable access to one whole worktree; that grant disappears on any connection loss and is never replayed.

The architecture has six security-critical properties:

1. Spool has one dedicated fixed-port ingress for both discovery and encrypted WebSocket traffic. It reuses Orca's crypto, framing, terminal, file, Git, and execution Modules without inheriting the existing mobile/runtime admission surface.
2. Tailnet source identity comes from Tailscale, while one-time tickets bind that identity to one E2EE client key and one connection attempt.
3. The host serializes a Public-only catalog. A requester never receives the owner's full repos, account state, AI Vault, paths, host targets, or credentials and then filters them locally.
4. Spool has a separate, default-deny RPC registry. Every exposed operation owns its external schema, resource binding, access rule, execution Adapter, result projection, and error projection.
5. Visibility and control are enforced by the owner process. Renderer gating is a usability mirror, not the authorization boundary.
6. One physical encrypted WebSocket carries catalog updates, RPC calls, and subscriptions. Losing it invalidates every pending request and grant associated with it.

## Scope decisions

This design covers Orca Git worktrees and the synthetic workspaces of a `Repo.kind = 'folder'` project on local, WSL, SSH, and paired runtime execution hosts. A folder project's root workspace uses `repoId::path`; additional workspace instances use `repoId::path::workspace:<uuid>`. Independent ProjectGroup-backed `FolderWorkspace` entries keyed as `folder:<uuid>` remain deferred; they do not yet participate in Spool visibility or publication.

A folder-project workspace gets a durable incarnation from a random `.orca-spool-incarnation-v1` marker created at its canonical root. The marker is owner-only Spool metadata: Files hides it and rejects direct or symlinked access. The actual host sandwiches marker access between stable directory `dev`/`ino` checks, then derives the published UUID from the marker, actual-host scope, and directory identity. Renaming or moving the same directory preserves the proof, while replacing the directory or copying its marker does not. A host that cannot provide stable directory identity or durable marker storage cannot publish that folder workspace.

The first version does not expose browser profiles, cookies, OS dialogs, the owner's clipboard, settings, account selection, hosted-review mutations, issue trackers, automations, emulator/computer control, pairing administration, or SSH trust and credential prompts. These are not reliably worktree-scoped and are not covered by the approval copy.

Once a control grant exists, a terminal is still a normal shell and can exercise the owner's broader OS-user authority. The narrower GUI RPC surface prevents accidental cross-worktree actions; it is not a sandbox.

## Ubiquitous language

| Term                  | Meaning                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner Desktop**     | The running Orca Desktop process that publishes worktrees and executes remote operations.                                                                        |
| **Requester Desktop** | The running Orca Desktop process browsing or requesting control of another Desktop.                                                                              |
| **Tailnet principal** | Tailscale-authenticated source node identity obtained from the inbound network flow. It identifies a machine/node, not a human account inside Spool.             |
| **Connection**        | One physical E2EE WebSocket. It is the smallest grant lifetime and has one server-generated `connectionId`.                                                      |
| **Connection epoch**  | Requester-side generation that changes immediately whenever the physical socket changes. UI control state is keyed by it.                                        |
| **Worktree instance** | One durable workspace incarnation, represented by `WorktreeMeta.instanceId` and validated against an owner-only Git or folder marker on the actual host.         |
| **Share epoch**       | A generation for one worktree's current Public publication. It rotates on Private, delete, incarnation change, and later re-publication.                         |
| **Public projection** | The sanitized Desktop → Project → Worktree → Session catalog serialized by the owner.                                                                            |
| **Control grant**     | An in-memory capability for one connection and one Public worktree instance. Several connections may hold separate grants concurrently.                          |
| **Opaque reference**  | A random, connection-scoped identifier that the owner resolves to a project, worktree, session, terminal, file root, or pane. It is never a raw path or host ID. |

## System view

```text
Requester Desktop                                      Owner Desktop

TailscaleCommandAdapter                                TailscaleCommandAdapter
          │                                                       │
TailnetPeerDirectory ── POST /spool/v1/probe :SPOOL_INGRESS_PORT ──► SpoolIngress
          │                                              │ whois(source)
          │◄── descriptor + E2EE key + one-use ticket ───┤
          │                                              │
SpoolPeerConnection ── WS /spool/v1/connect :SPOOL_INGRESS_PORT ──►│
          │                 one E2EE socket               │
SpoolDesktopCatalog                              SpoolRpcGateway
          │                                      ├─ SpoolShareCatalog
          │                                      ├─ SpoolAccessAuthority
          │                                      └─ SpoolExecutionGateway
          │                                                   │
          │                                      local / WSL / SSH / runtime
          ▼                                                   ▼
renderer slice/UI                                      existing Orca execution
```

The Tailnet is the discovery population and network path. It is not a Spool account system. Orca still performs application authentication, projection, authorization, and revocation.

## Module map

The design favors a small number of deep Modules. Their Interfaces hide platform differences, identity mapping, lifecycle cleanup, and existing Orca execution details.

### TailnetControl

`TailnetControl` is the Seam between Spool and the installed Tailscale client:

```ts
interface TailnetControl {
  readSnapshot(): Promise<TailnetSnapshot>
  identifySource(address: TailnetFlowAddress): Promise<TailnetPrincipal | null>
}
```

The first production Adapter is `TailscaleCommandAdapter`. It invokes the binary with `execFile`, never through a shell, and owns:

- Ordered lookup on `PATH`, the standard macOS app bundle location, standard Linux locations, and standard Windows installation locations.
- Strict command timeouts, stdout/stderr byte caps, bounded concurrency, and cancellation.
- Defensive parsing of `tailscale status --json` and `tailscale whois --json`.
- IPv4, IPv6, IPv4-mapped IPv6, DNS-name, and node-ID normalization.
- A short successful-identity cache and per-source lookup rate limit so probes cannot create unbounded subprocesses.
- Clear `unavailable`, `not-running`, `permission-denied`, `unsupported-output`, and `timed-out` diagnostics.

The Interface permits a LocalAPI Adapter later without changing Spool. Tailscale documents `status --json` and `whois --json` for automation but warns that JSON output can change, so missing identity fields always fail closed. See the [Tailscale CLI reference](https://tailscale.com/docs/reference/tailscale-cli) and [identity documentation](https://tailscale.com/docs/concepts/tailscale-identity).

### TailnetPeerDirectory

`TailnetPeerDirectory` owns requester-side discovery:

```ts
interface TailnetPeerDirectory {
  snapshot(): readonly DiscoveredSpoolDesktop[]
  subscribe(listener: (snapshot: readonly DiscoveredSpoolDesktop[]) => void): () => void
  start(): void
  stop(): void
}
```

It reads only peers enumerated by `TailnetControl`; it never scans `100.64.0.0/10`. It probes all advertised Tailnet IPs with bounded parallelism and deduplicates them by verified node ID. A successful probe is authoritative that Orca Desktop is running. A peer is removed after two missed reconciliation passes to avoid one transient timeout flickering the sidebar.

`Online` from `tailscale status` is advisory. The Spool probe and encrypted connection decide usability.

### SpoolIngress

`SpoolIngress` is a dedicated HTTP/WebSocket listener. V1 fixes `SPOOL_INGRESS_PORT = 52777`, inside IANA's dynamic/private range, and binds only the current local Tailscale addresses. It runs only in Orca Desktop mode, not `orca serve`.

The same listener serves:

- `POST /spool/v1/probe` for source verification and one-time ticket issuance.
- `GET /spool/v1/connect` with WebSocket upgrade for the one physical encrypted connection.

There is no dynamic second RPC port. One fixed port means one Tailnet ACL/firewall decision, and the listener never shares admission logic with paired mobile or runtime clients. If the port cannot bind, Spool reports a local diagnostic and remains disabled; normal Orca runtime/mobile RPC continues unaffected. No random fallback is advertised because peers would have no trustworthy way to find it.

The [IANA registry](https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml) defines `49152–65535` as dynamic/private rather than assigned service ports. `52777` avoids Orca's existing `6768`/`6769` runtime ports and is a wire-protocol constant, not a user preference. Because an ephemeral local connection can still occupy it, port-collision handling remains mandatory.

`SpoolIngress` owns one listener per current Tailnet IPv4/IPv6 address on the same port. It reconciles additions and removals when the Tailnet snapshot changes, using IPv6-only socket options where needed so dual-stack binds do not collide. Existing sockets on a removed address close and therefore revoke normally. It never falls back to a wildcard bind.

On Windows, a Spool-specific firewall rule is created, updated, and removed through the same platform-aware pattern as Orca's current mobile rule, but scoped to the Spool executable and fixed port. Failure surfaces an actionable diagnostic rather than silently claiming the Desktop is discoverable.

The listener enforces bounded request bodies, a pre-auth timeout, per-node connection limits, total connection limits, probe rate limits, and a protocol-version negotiation header. It rejects browser Origin/CORS requests and forwarded-address headers; only the socket's normalized remote address participates in identity.

The probe descriptor is limited to protocol versions, owner runtime ID, Spool public key/fingerprint, Orca version, and OS family. User and device display names come from the requester's verified Tailnet snapshot, not a peer-supplied label. Catalog, quota, paths, account state, and host inventory are available only after encrypted authentication and projection.

### SpoolTicketAuthority

`SpoolTicketAuthority` owns short-lived connection admission:

```ts
interface SpoolTicketAuthority {
  issue(binding: SpoolTicketBinding): SpoolTicket
  consume(ticket: string, binding: SpoolTicketBinding): AuthenticatedSpoolPrincipal | null
  clear(): void
}
```

A ticket is random, memory-only, one-use, and expires after 30 seconds. It is bound to:

- Verified requester Tailnet node ID and source Tailnet IP.
- Requester's ephemeral E2EE public key from the probe.
- Owner runtime ID and owner Spool key fingerprint.
- Negotiated Spool protocol version.

The ticket contains no capability and grants no catalog access until consumed during the encrypted handshake. It cannot be used as a paired runtime token.

### SpoolPeerConnection

`SpoolPeerConnection` owns exactly one requester-side physical socket per Owner Desktop:

```ts
interface SpoolPeerConnection {
  request<TResult>(method: string, params: unknown): Promise<SpoolResult<TResult>>
  subscribe<TResult>(method: string, params: unknown, sink: SpoolSink<TResult>): SpoolSubscription
  subscribeState(listener: (state: SpoolConnectionState) => void): () => void
  close(): void
}
```

It reuses extracted Orca E2EE framing, bounded backpressure, and heartbeat, but it does not inherit `RemoteRuntimeSharedControlConnection`: that class has different reconnect/replay semantics and currently permits separate stream sockets. Spool V1 keeps terminal output and control on the checked JSON RPC registry; inbound binary frames fail the physical connection closed instead of opening a second authorization path.

On socket loss, `SpoolPeerConnection` synchronously:

1. Increments its connection epoch.
2. Publishes `read-only/disconnected` to the requester UI.
3. Rejects all pending mutations; a request whose outcome is unknown is reported as `outcome_unknown`.
4. Ends logical streams and drops all local grant state.
5. Notifies `SpoolDesktopCatalog`; it does not perform discovery or reconnect itself.

After a fresh socket authenticates, it may recreate catalog and selected Public-read subscriptions. It never replays a control request, approval, terminal input, file write, Git mutation, session mutation, or other side effect.

### SpoolDesktopCatalog

Requester-side `SpoolDesktopCatalog` is the sole coordinator above discovery and connections:

```ts
interface SpoolDesktopCatalog {
  snapshot(): readonly SpoolRemoteDesktop[]
  subscribe(listener: (snapshot: readonly SpoolRemoteDesktop[]) => void): () => void
  requestControl(target: SpoolControlTarget): Promise<void>
  revokeLocalConnection(desktopRef: string): void
}
```

It owns `TailnetPeerDirectory`, creates and replaces `SpoolPeerConnection` instances, obtains fresh tickets, restores only read subscriptions, and projects main-process facts to IPC. This is the only requester-side Module that decides when to reconnect. `SpoolPeerConnection` owns a socket; `TailnetPeerDirectory` owns peer reconciliation; neither calls the other.

The active/selected remote workspace route is renderer navigation state and does not live in `SpoolDesktopCatalog`.

### SpoolWorktreeVisibility

`SpoolWorktreeVisibility` is the only Module allowed to interpret or mutate sharing fields in `WorktreeMeta`:

```ts
interface SpoolWorktreeVisibility {
  snapshot(): SpoolVisibilitySnapshot
  setWorktree(worktreeId: string, visibility: 'public' | 'private'): void
  setProject(projectId: string, visibility: 'public' | 'private'): void
  resolvePublicInstance(instanceId: string, shareEpoch: string): PublicWorktreeInstance | null
  subscribe(listener: (change: SpoolVisibilityChange) => void): () => void
}
```

`WorktreeMeta` gains:

```ts
spoolVisibility?: 'public' | 'private' // missing means private
spoolIncarnationId?: string
```

The current path-derived `Worktree.id` is not an authorization identity. `instanceId` names the logical workspace, while `spoolIncarnationId` proves that its current Git worktree or folder directory is the incarnation that the owner published.

Publishing a worktree performs these steps on its actual execution host:

1. Resolve its canonical root and actual-host scope.
2. For a Git target, resolve the per-worktree Git administrative directory and read or create its private random marker. For a folder target, read or create the hidden random marker at the canonical root while stable `dev`/`ino` evidence proves that the root did not change around marker access.
3. Compare it with persisted `spoolIncarnationId`; a mismatch rotates `instanceId`, clears session provenance, and leaves the worktree Private.
4. Reject overlapping registered roots. Synthetic workspaces from the same folder repo may share one exactly equal root; cross-repo overlap and ancestor/descendant overlap remain rejected.
5. Persist Public synchronously and atomically.
6. Rotate the share epoch and only then publish the worktree.

Every startup and host reconnection revalidates the incarnation proof before initial publication. Missing Git support for a Git target, unavailable stable directory identity or marker storage for a folder target, an unavailable execution host, or an ambiguous/overlapping root is `not shareable`, never an optimistic Public state. After a successful publication, a transport-classified host outage may retain only the same-epoch sanitized catalog row; every operation remains unavailable until incarnation revalidation succeeds again. If a new disallowed overlapping root appears beneath a Public root, publication is suspended fail closed until the owner resolves the overlap.

`resolvePublicInstance` also revalidates the incarnation proof when binding every supported structured file, Git, session, and terminal subscription operation, and mutation admission revalidates it again at its commit/spawn guard. A host-side reconciliation loop invalidates long-lived streams when the proof or root disappears; it is an acceleration, not a substitute for bind/commit checks.

### Visibility durability

The existing `Store.setWorktreeMeta()` is debounced and cannot protect a security state. `Store` therefore adds one narrow operation, `commitSpoolVisibility(changes)`, which mutates a cloned state, uses the existing synchronous atomic `flushOrThrow()` path, and rolls back on failure.

A small deny journal in the canonical user-data directory closes the Private crash window:

- **Make Private:** synchronously add affected instance IDs to the atomic deny journal; change the in-memory visibility epoch; revoke grants and purge streams; commit Private metadata; then remove the now-redundant journal entries.
- **Make Public:** validate the host incarnation; commit Public metadata; remove any deny entry; then advertise a fresh share epoch.
- **Startup:** apply deny entries before starting `SpoolIngress`, repair metadata to Private, and only then consider persisted Public entries.

If either security store cannot write, Spool stops its ingress and surfaces the persistence failure. It does not continue sharing from uncertain state.

Project bulk actions resolve the project's current worktree IDs once and commit them in one visibility transaction. `Make all public` prevalidates every current worktree and changes none if any incarnation/root cannot be proven; `Make all private` journals and invalidates the whole resolved set together. A worktree created afterwards has no `spoolVisibility` value and is therefore Private.

### SpoolShareCatalog

`SpoolShareCatalog` owns the only remotely serializable model:

```ts
interface SpoolShareCatalog {
  openProjection(principal: AuthenticatedSpoolPrincipal): SpoolCatalogProjection
  closeProjection(connectionId: string): void
}
```

Each connection gets a distinct `SpoolCatalogProjection` and a fresh opaque-reference table. References are 128-bit random values and rotate on connection replacement, Private, delete, incarnation change, or re-publication. The projection contains:

```ts
type SpoolDesktopCatalog = {
  protocolVersion: number
  ownerRuntimeId: string
  catalogRevision: number
  quota: readonly SpoolProviderQuota[]
  projects: readonly SpoolProjectCatalogEntry[]
}

type SpoolProjectCatalogEntry = {
  projectRef: string
  name: string
  worktrees: readonly SpoolWorktreeCatalogEntry[]
}

type SpoolWorktreeCatalogEntry = {
  kind: 'git' | 'folder'
  worktreeRef: string
  shareEpoch: string
  name: string
  branch: string | null
  sessions: readonly SpoolSessionCatalogEntry[]
  sessionCatalog: {
    status: 'loading' | 'complete' | 'error'
    nextCursor: string | null
  }
}

type SpoolSessionCatalogEntry = {
  sessionRef: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}
```

The wire model deliberately omits absolute paths, `instanceId`, repo IDs, execution-host IDs, SSH target IDs, pairing data, activity/status categories, AI Vault file paths, Codex home paths, and resume commands. A project with no Public worktrees is omitted. The Desktop and sanitized quota may remain visible even when the projects array is empty.

The owner catalog stream sends bounded project/worktree base rows. `catalog.sessions.page` then returns at most 512 sessions behind a connection-scoped opaque cursor until every attributable session reaches `complete`; the requester main process merges pages before projecting them to the renderer. A failed or malformed chain is `error`, never a shorter list presented as complete, and retries read-only pages with bounded exponential backoff until a new catalog or disconnect cancels the chain. Quota-only updates retain the identity-bearing `catalogRevision` and reuse in-flight or completed worktrees instead of restarting pagination.

Snapshots and pages carry `ownerRuntimeId` in the authenticated envelope, `catalogRevision`, and worktree `shareEpoch`; page cursors are additionally bound to the projection generation and physical connection. A consumer discards a late result that does not match every applicable generation. Private, delete, incarnation change, or connection replacement invalidates the whole chain, including session aliases learned on later pages.

### SessionCatalog

`SessionCatalog` is an internal part of `SpoolShareCatalog`, not a global AI Vault passthrough. Claude/Codex AI Vault files are external records and are not modified to add Spool fields. A separate local `SpoolSessionProvenanceIndex` persists:

```text
(execution-host identity, provider, provider session ID)
  → (worktree instanceId, spool incarnationId)
```

The index lives in canonical user data as an atomically replaced, versioned `spool-session-provenance.json`; it never leaves the owner. Session create, resume, and proven live binding update it. Incarnation rotation and worktree deletion purge its entries. Losing an update can only hide a session, not publish an unproven one. The catalog merges:

- Workspace tabs and live terminal handles.
- Claude and Codex session records.
- Historical AI Vault records that have proven worktree-instance provenance.

Agent session ID is the preferred deduplication key. Execution host plus canonical current root is a secondary consistency check, not the durable identity.

The first time an owner makes an existing worktree Public, the publication confirmation bulk-attests legacy candidates whose execution host and canonical CWD resolve to that worktree as the most-specific registered root. Those candidates are written to the provenance index before Public is committed; there is no per-session visibility toggle. A candidate with a missing host/CWD or ambiguous root is not attributable to that worktree and remains undisclosed. After this one-time migration, all newly observed sessions carry durable provenance.

Selecting a live session attaches a read subscription to its terminal. Selecting a historical session returns a sanitized transcript for requester-side rendering. Continuing a historical session is a control mutation: the owner resolves the saved record and constructs its resume command internally after authorization. The requester never receives or supplies a resume command.

### Quota projection

The quota projection receives a narrow `getCachedActiveRateLimitState()` dependency from the main-process composition root. It does not call `accounts.list`, `runtime.getAccountsSnapshot()`, or any source that returns identities or performs refresh. A Public catalog request never triggers provider authentication, refresh, account switching, or a credential prompt.

```ts
type SpoolProviderQuota = {
  provider: 'claude' | 'codex'
  status: 'ok' | 'unavailable'
  updatedAt: number | null
  fiveHour: { usedPercent: number; resetsAt: number | null } | null
  sevenDay: { usedPercent: number; resetsAt: number | null } | null
}
```

Projection strips account email, account ID, organization/workspace, authentication source, credential paths, targets, raw provider errors, raw responses, usage metadata, and token/cookie material.

### SpoolAccessAuthority

`SpoolAccessAuthority` owns all pending requests and grants:

```ts
interface SpoolAccessAuthority {
  request(target: {
    connectionId: string
    instanceId: string
    shareEpoch: string
  }): SpoolControlRequest
  decide(ownerDecision: SpoolOwnerDecision): SpoolControlDecision
  requireControl(connectionId: string, instanceId: string, shareEpoch: string): ControlGrant
  revoke(grantId: string): void
  connectionClosed(connectionId: string): void
  subscribeOwnerRequests(listener: (requests: readonly SpoolControlRequest[]) => void): () => void
}
```

The RPC gateway resolves `worktreeRef` before calling the authority. This keeps access decisions independent of connection-scoped catalog aliases. Worktree invalidation and connection cleanup are internal operations invoked through the gateway's connection lifecycle, not fan-out responsibilities for the application composition root.

It stores a set of grants, not one scalar controller state. A grant record contains:

```text
grantId
ownerRuntimeId
verified requester Tailnet node ID
physical connectionId
worktree instanceId
shareEpoch
approvedAt
```

The exact socket and verified Tailnet node are authority. Requester-supplied Desktop labels or runtime descriptors are never authority. Approval copy uses the verified Tailnet user/node display; Orca version/platform labels are descriptive.

Requests are deduplicated per connection and worktree. Approval rechecks that the same connection is alive and the same share epoch is Public. A disconnect, Private transition, incarnation rotation, or delete removes pending requests so a late `Allow` cannot create a grant.

The owner renderer receives a queued main-process event and answers through owner-only IPC. Several requesters can be approved concurrently, and the owner UI lists/revokes each exact grant. Private revokes all grants for that worktree.

### Authenticated principals

The generic E2EE channel is refactored so authentication returns an immutable discriminated principal rather than a Boolean:

```ts
type AuthenticatedRpcPrincipal =
  | { kind: 'paired-device'; deviceId: string; scope: 'mobile' | 'runtime' }
  | {
      kind: 'spool'
      connectionId: string
      tailnet: TailnetPrincipal
      channelKeyFingerprint: string
    }
```

Legacy `{ type: 'e2ee_auth', deviceToken }` remains compatible on the existing runtime listener. Spool's dedicated listener accepts only `{ type: 'e2ee_auth', spoolTicket }`. A channel cannot switch principal after authentication, and every JSON dispatch receives the same immutable principal object. Binary data remains available to existing paired-device protocols but is rejected on the dedicated Spool gateway in V1.

Spool uses a dedicated persisted E2EE keypair in canonical user data. The probe returns its public key and fingerprint. This fingerprint distinguishes Orca installations on a Tailnet node but is not a replacement for Tailscale source identity; the first probe is trust-on-the-Tailnet, not a public-key infrastructure.

Requester-side list identity is `(verified Tailnet node ID, owner Spool key fingerprint, owner runtime ID)`. The node identifies the Tailnet machine, the persistent Spool key distinguishes the Orca installation, and the runtime ID detects application restart. The owner still authorizes the requester by verified node plus exact socket; the requester's ephemeral channel key only prevents ticket transfer and is not presented as a human/device identity.

## Connection handshake

One requester-to-owner connection is established as follows:

1. The requester obtains the owner's node ID and Tailnet IPs from `TailnetControl.readSnapshot()`.
2. It generates one ephemeral E2EE client keypair for this connection attempt.
3. It posts a bounded probe containing protocol versions and the client public key to the exact Tailnet IP on `SPOOL_INGRESS_PORT`.
4. The owner derives the source from the TCP socket and calls `identifySource`; it ignores identity claims in the body.
5. The owner returns only its runtime ID, Spool key fingerprint/public key, protocol selection, sanitized Desktop descriptor, ticket, and expiry.
6. The requester opens `ws://<the same Tailnet IP>:SPOOL_INGRESS_PORT/spool/v1/connect`. It never follows an endpoint hostname or address supplied by the peer.
7. The existing ECDH handshake creates an encrypted channel. The encrypted auth frame presents the one-use ticket.
8. The owner consumes the ticket against the actual socket source and hello public key, creates a physical `connectionId`, and binds one immutable Spool principal.
9. Only then may the requester subscribe to the Public catalog.

Tailscale encrypts the network path; Orca E2EE protects the application frames and keeps Spool aligned with existing Orca remote protocols. A process that can fully compromise either endpoint machine remains outside the threat boundary.

## Dedicated Spool RPC registry

Spool does not expose the approximately 482-method runtime registry and then try to subtract unsafe methods. `SpoolRpcGateway` has a separate checked-in registry. Familiar wire names such as `terminal.subscribe`, `files.read`, and `git.status` may remain, but their Spool schemas accept opaque references and relative paths rather than the existing raw host parameters.

`SpoolRpcGateway` is the deep Module. Its registry is a declarative manifest whose entries select a small set of typed schemas, resource binders, execution operations, and result/error projectors owned by the file, Git, session, terminal, and catalog domains:

```ts
type SpoolMethodSpec = {
  name: string
  schema: SpoolExternalSchemaId
  access: 'catalog-read' | 'worktree-read' | 'worktree-control'
  binder: SpoolResourceBinderId
  operation: SpoolExecutionOperationId
  projector: SpoolResultProjectorId
}
```

This avoids hundreds of one-method pass-through wrappers while keeping every exposed operation explicit and reviewable. Omission means denial.

After authentication, `SpoolIngress` opens one connection-scoped gateway Module:

```ts
interface SpoolServerConnection {
  dispatchJson(frame: string): void
  close(): void
}

interface SpoolRpcGateway {
  openConnection(principal: AuthenticatedSpoolPrincipal): SpoolServerConnection
}
```

`close()` is idempotent and is the one owner-side cleanup path for aliases, pending requests, grants, streams, queues, and downstream subscriptions. The gateway subscribes once to `SpoolWorktreeVisibility`; Private, delete, and incarnation rotation fan out internally through the same connection Modules. `SpoolIngress` does not manually call several cleanup owners.

The dispatch sequence is:

1. Reject non-Spool methods before parsing and return a uniform `method_not_found`.
2. Parse the Spool-specific external schema.
3. Resolve connection-scoped references and bind them to one current worktree instance/share epoch.
4. Require Public read or the exact control grant.
5. Invoke the existing terminal/file/Git/session execution Module through `SpoolExecutionGateway`.
6. Project the result and errors, then recheck the share epoch before enqueueing read data.

Streaming emits carry a worktree/share epoch guard. Private or delete cancels the stream and drops queued data. Mutations have a final access-generation guard at their commit/spawn point. Once a process, Git operation, or write has crossed that point, later revocation prevents new work but does not promise rollback.

Private, nonexistent, stale-epoch, and cross-worktree references all return the same sanitized `resource_not_found`. Projected errors never contain owner paths, host IDs, command lines, credentials, or raw downstream error objects.

No policy is inferred from a method-name prefix. A test snapshots every exposed registry entry and fails if an entry lacks a real schema, binder, access class, execution operation, or projector.

## Capability matrix

| Area                       | Public                                                                           | With control                                                                | Always owner-only / denied remotely                                                                 |
| -------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Catalog                    | Sanitized Desktop/project/worktree/session list and cached quota                 | Same                                                                        | Raw repos, projects, accounts, settings, AI Vault, host inventory                                   |
| Sessions                   | List, read transcript, attach terminal output                                    | Continue a proven historical Claude/Codex session in an owner-side terminal | Structured create/rename/close; move across worktrees; account selection; global administration     |
| Terminal                   | Subscribe, bounded snapshot/scrollback, sequenced output and resize events       | Input and resize                                                            | Owner OS clipboard, auto-download, host notification or external-open side effects                  |
| Files                      | List tree, read/chunk/preview; view diff on Git targets                          | Create, write, rename, delete inside the worktree                           | OS file dialogs, reveal/open on owner Desktop, paths outside root, owner's clipboard                |
| Git                        | Git targets only: current worktree/index/HEAD status, diff, HEAD history, branch | Git targets only: stage, unstage, and commit through structured methods     | All Git APIs for folder targets; checkout/merge/rebase/fetch/pull/push; worktree administration     |
| Claude/Codex               | Observe existing session content and sanitized active quota                      | Continue a proven session; run a new agent command in a granted terminal    | Structured session creation; select/authenticate accounts; reveal credentials or account identity   |
| Browser/integrations       | None in V1                                                                       | None in V1                                                                  | Profiles, cookies, hosted reviews, GitHub/GitLab/Linear/Jira writes, automations, emulator/computer |
| Worktree administration    | None                                                                             | None                                                                        | Public/Private, approve/deny/revoke, delete worktree, create other worktrees                        |
| SSH/runtime administration | Observe `resource_unavailable` only                                              | Use an already-authorized route                                             | Host-key trust, credentials, pairing, interactive reconnect prompts, target management              |

The matrix is the product-level rule; the checked-in registry is its executable inventory. The granted terminal remains a normal owner-side shell, so it can run commands beyond the narrower structured GUI methods without turning those commands into Spool RPC capabilities. Adding an exposed operation requires updating both and adding a security-contract test.

## SpoolExecutionGateway

`SpoolExecutionGateway` hides where the owner worktree actually runs:

```ts
interface SpoolExecutionGateway {
  invoke<T>(target: BoundWorktreeTarget, operation: SpoolOperation<T>): Promise<T>
  subscribe<T>(
    target: BoundWorktreeTarget,
    operation: SpoolSubscriptionOperation<T>
  ): SpoolHostSubscription
  closeConnection(connectionId: string): void
}
```

- Local and WSL worktrees reuse the owner runtime's current filesystem, Git, PTY, and agent execution Modules.
- SSH worktrees reuse the already-established SSH relay and providers.
- Paired runtime-backed worktrees forward through the owner's persisted runtime connection.

The gateway chooses an actual-host `SpoolHostAdapter`. Besides normal operations, each Adapter must provide `resolveWorktreeIncarnation` and `openVerified`. The paired-runtime Adapter therefore adds narrow owner-only downstream operations for Git or folder markers, folder directory identity, and verified file access; the Owner Desktop cannot inspect a runtime host's marker, directory identity, or file handles directly. These internal operations are authenticated by the existing paired-runtime principal and are absent from the external Spool registry.

Authorization always happens on the Owner Desktop before forwarding. The downstream call receives internal owner credentials, never the requester's ticket or principal. Upstream and downstream cancellation are linked. A forwarded Spool call cannot recursively expose another Spool gateway.

Remote traffic cannot create an SSH/runtime route or trigger trust, credential, pairing, or account prompts. If an already-authorized route is absent, the owner returns sanitized `resource_unavailable`. The owner may reconnect it independently through existing policy; requester traffic does not broaden that policy.

### Execution admission guard

Dispatch-time authorization is not the last mutation check. `SpoolExecutionGateway` creates an `ExecutionAdmissionGuard` bound to connection, instance, share epoch, and grant generation:

```ts
interface ExecutionAdmissionGuard {
  beforeSideEffect(): void
}
```

The existing file, Git, session, and PTY execution Modules gain a narrow optional guard and call it after target/path resolution but immediately before their first real write, rename, delete, Git/process spawn, PTY input, resize, or session lifecycle mutation. Concretely, this introduces Seams in `orca-runtime-files.ts`, `orca-runtime-git.ts`, agent/session spawn paths, and terminal input/viewport handling; a check only in `SpoolRpcGateway` is insufficient.

For local, WSL, and direct SSH-provider operations, that call is the commitment boundary. For a paired runtime, successful transmission of the authenticated downstream mutation is the V1 commitment boundary: after the owner sends it, Spool treats the mutation as started even if the downstream process has not spawned yet. A stronger downstream two-phase admission protocol is not assumed. Revocation before transmission blocks; revocation after transmission does not promise cancellation or rollback.

## File and path containment

Spool file schemas contain a `worktreeRef` and a normalized relative path. The host resolves them on the actual execution host using its path semantics.

For every GUI file operation:

1. Resolve the current canonical worktree root.
2. Reject absolute paths, device paths, drive changes, NULs, and traversal before host resolution.
3. Resolve the target's real path, or for a create, the nearest existing parent's real path.
4. Require containment beneath the canonical root using platform-aware path comparison.
5. Recheck the worktree instance/share epoch and control grant at read enqueue or write commit.

For a Git target, the file binder hides and rejects the in-root `.git` file/directory and every resolved per-worktree or common Git administrative path, preserving the existing Git containment rules. A folder target has no Git administrative root: it rejects every relative path containing a `.git` segment and hides every `.git` entry at every depth, case-insensitively. It also hides and rejects the root incarnation marker, including aliases and symlinks. Structured `files.diff` and all `git.*` operations are unavailable for folder targets. Only internal host Adapters may touch incarnation or Git administration metadata; it is never part of the Public file tree.

Containment covers symlink escapes and symlink retargeting within the endpoint threat boundary. Public reads use a host-side `openVerified` operation: traverse with no-follow semantics where the platform supports it, resolve and stat the canonical target, open a handle, compare the handle identity with the resolved identity, read through that handle, and recheck the share epoch before returning bytes. The SSH/runtime relay implements the operation on the execution host. Where a backend cannot prove a symlink-containing traversal, it rejects that path rather than falling back to path-only checks. Create/write operations use a verified parent handle or reject symlink components, then verify the parent again at their commit guard.

Directory enumeration is descriptor-bound through `/proc/self/fd` when this code runs in a Linux process, including a relay or runtime actually executing on Linux. Node does not expose handle-relative `scandir` on macOS or Windows; a Windows main process accessing WSL through UNC therefore also uses the Windows fallback. Those hosts use the already-verified directory handle plus canonical pathname identity checks immediately before opening the directory stream, immediately after opening it, and again after buffering every entry; the batch is discarded on any mismatch and is never streamed incrementally. This leaves a narrow non-atomic ABA replacement residual for a process already able to rename paths as the owner's OS user. Such a process is an endpoint compromise, and a granted remote shell already has broader authority, so V1 accepts that platform residual rather than disabling the core Files experience on macOS and Windows.

The containment Module runs through local, WSL, SSH, and runtime filesystem Adapters; it never applies a POSIX string prefix to a Windows or remote-host path.

`files.open` and `files.openDiff` currently mutate the owner's renderer. They are not Public reads. Spool fetches file/diff data and opens it in the requester renderer instead.

This containment applies to structured GUI operations only. A granted shell may `cd` anywhere its OS user can access, as the approval warning states.

## Git read profile

“Read-only Git” means no intended repository mutation or network access, not merely a method whose name sounds read-only. Public Git reads use a separately audited execution profile:

- `GIT_TERMINAL_PROMPT=0`, no pager, and no credential prompt.
- `GIT_OPTIONAL_LOCKS=0` so observational commands avoid optional index locks.
- Filesystem monitor integration disabled for the invocation.
- External diff and text conversion disabled where the command supports their Git 2.25-compatible switches.
- No fetch, remote helper, hosted-provider refresh, or implicit upstream network call.
- Output, file count, diff size, and execution time bounded.

Sibling worktrees often share one Git common directory, refs, and object database even when their filesystem roots do not overlap. Public Git input therefore cannot select an arbitrary ref, branch, revision range, or object ID. History starts only at the Public worktree's current `HEAD`; the projection issues opaque commit references for commits it has already returned from that ancestry, and detail/diff calls accept only those references. Working-copy diffs use fixed worktree/index/HEAD bases. Current-upstream projection is limited to its name and ahead/behind counts, not upstream-only content. Local branch enumeration, ref search, and sibling worktree state are denied.

The Public read profile is a new mode in the existing Git execution Module, not the behavior of today's `git.status`/`git.diff`/`git.history` handlers. Implementation extends `orca-runtime-git.ts` and the lower Git command Modules so the profile applies on the actual host. Every option must satisfy `docs/reference/git-compatibility.md`; preferred newer behavior needs the existing host-scoped capability/fallback pattern.

A granted terminal can run fetch, checkout, merge, rebase, and ref updates that affect repository state shared by Private sibling worktrees. That is accepted under the powerful control grant; V1 does not expose those actions as structured Git RPCs, and the GUI remains scoped to the selected worktree without claiming repository isolation.

## Terminal protocol and safety

Spool V1 deliberately uses the separate checked JSON methods `terminal.subscribe`, `terminal.input`, and `terminal.resize` over the single encrypted socket. It does not register the broad paired-device `terminal.multiplex` handler. The subscription binds a connection-scoped session alias to one owner terminal, emits a bounded initial snapshot followed by sequenced output/resize events, and closes on publication invalidation.

`terminal.input` and `terminal.resize` each bind the alias again from the current connection projection and in-memory Public publication, then require the exact current worktree grant. This bind path does not rescan every Public worktree: the actual-host incarnation plus grant-generation guard still runs immediately before the PTY or viewport side effect. A binary frame sent to the Spool listener is a protocol violation and terminates the physical connection, which also revokes its grants.

A Public viewer does not register as a terminal driver, viewport owner, query authority, or display subscriber with owner-side effects. The first granted resize/input may register requester viewport state, and revoke removes that state. No lease or conflict arbitration is added; owner and approved requesters may race.

Requester-side terminal rendering treats remote output as untrusted active content. OSC clipboard writes, automatic file/image downloads, automatic URL opening, host notifications, and shell-integration actions with local side effects are disabled for Spool sessions. Hyperlinks may be shown but require an explicit requester click.

## Single-socket QoS

One socket must not let terminal output grow memory indefinitely or preserve authority after invalidation. Encrypted JSON replies therefore use one ordered bounded queue. If the transport backlog crosses the hard cap, the socket is terminated and the requester must rebuild read subscriptions from fresh snapshots. Terminal events carry monotonically increasing sequence numbers so the renderer drops duplicates and stale events.

Private, delete, incarnation-proof/root drift, and incarnation changes terminate the physical Spool socket rather than attempting to selectively purge an encrypted WebSocket backlog. That teardown discards application queues, closes streams, and revokes all connection grants. Bytes already delivered to the peer cannot be recalled; revocation prevents later admission and enqueueing but does not roll back a started process.

## Resource limits

Limits are protocol constants and return sanitized `resource_busy` or `result_too_large` errors rather than allocating without bound. At minimum the implementation caps:

- Probe body size, probe concurrency, and probes per source.
- Pre-auth sockets, total sockets, and sockets per Tailnet node.
- Concurrent RPCs and pending owner approvals per connection.
- Logical subscriptions and terminal streams per connection/worktree.
- Terminal snapshot and retained scrollback bytes.
- File chunk size, directory entry count, search result count, and diff bytes.
- Public worktrees per owner Desktop (128).
- Catalog page size and session-delta batch size.
- Outbound queue bytes globally and per stream.

The Public-worktree cap is enforced before the durable visibility transition. Publishing the 129th worktree, including a project bulk action that would cross the cap, fails atomically; the catalog never truncates Public rows to fit the wire limit.

Control requests are deduplicated per connection/worktree. A denied request has a short per-connection cooldown to prevent dialog spam while preserving the explicit-request model.

## Renderer architecture

Network connections and tickets stay in the requester main process. `SpoolDesktopCatalog` owns peer connections, their connection epochs, catalog snapshots, and requester actions. `src/main/ipc/spool-sharing.ts` plus a narrow preload contract exposes sanitized snapshots/actions to a volatile Zustand slice:

```text
src/renderer/src/store/slices/spool-sharing.ts
```

Grant state, opaque references, pending requests, and remote routes are never persisted in the workspace session. Only harmless disclosure expansion preferences may persist.

The renderer does not synthesize `Repo`, `Worktree`, or persisted `WorkspaceKey` objects for remote resources. Those types carry local paths, host IDs, persistence behavior, reconciliation, and Git assumptions. It uses a separate route:

```ts
type SpoolWorkspaceRoute = {
  desktopRef: string
  worktreeRef: string
  sessionRef?: string
  connectionEpoch: number
}
```

### Sidebar

A pure `spool-sidebar-rows.ts` projection creates Desktop, Project, Worktree, quota, and Session row kinds. A new `workspace-sidebar-row-projection.ts` is the explicit high-level Seam that combines existing local `RenderRow[]` with `SpoolSidebarRow[]` and owns virtual-row keys, measured sizes, sticky behavior, and ordering. `worktree-list-groups.ts` and `WorktreeCard` continue to model only local worktrees.

The rows use existing sidebar typography, spacing, hover/selection tokens, disclosure behavior, and shadcn primitives from `docs/STYLEGUIDE.md`. There are no Live/Stopped/Resumable pills. A Desktop can remain present with quota and no Public projects.

`DesktopQuotaRows` is a small presentational Module using the same normalized meter tokens as the status bar; it does not import the large `StatusBar` Module or raw account slices.

### Workspace surface

At the content root, `SpoolWorkspaceSurface` is selected instead of the local workspace surface. It resolves the opaque route through `spool-sharing-selectors.ts` and renders three isolated read surfaces: Sessions, Files, and, for Git targets only, Changes. Folder targets omit Changes and every diff control. No surface receives a local `Worktree` or owner absolute path.

`SpoolSessionPane` and `SpoolTerminalPane` render transcripts and a direct xterm subscription. `SpoolFilesPane`, `SpoolFileTree`, and `SpoolFilePreview` own relative-path browsing and requester-side previews. `SpoolGitPane`, `SpoolGitSidebar`, and `SpoolGitDiffPane` own the bounded Git surface. They invoke the checked Spool IPC methods instead of adapting local Explorer, editor, Source Control, or `PtyTransport` state.

`SpoolTerminalPane` starts `terminal.subscribe`, applies one bounded snapshot followed by monotonically sequenced output/resize events, and drops duplicate or stale sequences. A disconnect or new connection epoch tears down the subscription; reopening starts a fresh subscription and snapshot. There is no terminal ACK/resync or separate PTY transport protocol in V1. Terminal input and resize consult the current `canControl` selector and enter the same ordered mutation queue used to surface uncertain outcomes. The queue coalesces short adjacent input bursts up to the terminal chunk limit, including bytes that arrive while the previous acknowledged mutation is in flight; resize remains an ordering barrier.

All Spool file, Git, terminal, and session mutation controls consume the dynamic `canControl` selector. Browser and integration entry points remain unavailable in V1 regardless of the grant. On epoch change, revoke, or Private, one state transition makes every exposed surface read-only in the same render turn. The server remains authoritative if a renderer path misses a gate.

### Owner approval surface

Incoming requests follow the existing queued-dialog pattern: main process authority → renderer event → volatile request queue → one root-level `SpoolControlRequestDialog`. Disconnect, Private, or delete emits cancellation and closes a stale dialog.

The initial focus is `Deny`, so Enter cannot accidentally approve. `Allow this connection` uses the normal primary action style. Deny and Revoke are quiet actions, not destructive-red styling.

The approval copy remains:

```text
Allow Xinyao · MacBook to control this worktree?

They will be able to send terminal input, modify files,
run commands, and use your Claude/Codex accounts.
Terminal commands are not confined to this worktree.

                         [Deny] [Allow this connection]
```

Making a worktree Public also requires owner-visible copy explaining that every existing session transcript/scrollback and future terminal output becomes readable and may already contain content produced outside the worktree. This is necessary because no file-containment rule can redact arbitrary bytes previously printed in a terminal.

## Lifecycle state machines

### Visibility

```text
Private
  └─ owner publishes + incarnation validates + durable commit
       ▼
Public(read)
  ├─ owner makes Private ───────────────► Private
  ├─ delete/incarnation mismatch ───────► Private/new instance
  └─ control approval (per connection) ─► Public(read) + Grant set
```

Visibility belongs to the worktree. Grants are a separate set and never turn Public into a persisted “controlled” state.

### Request and grant

```text
none ── request ACK ──► pending ── owner allow ──► granted
 │                         │                         │
 │                         ├─ deny/cancel ─────────► none
 │                         └─ disconnect/private ──► none
 └──────────────────────────────────────────────────┘
                    revoke/disconnect/private/delete
```

The owner decision is valid only against the exact request ID, connection ID, instance ID, and share epoch that produced the dialog.

### Mutation outcome

```text
received → bound → authorized → commit/spawn guard → started → result
                         │                │
               revoke blocks here        └─ later revoke does not roll back
```

Mutations are never automatically retried. If the socket dies after the commit/spawn guard and before the reply, the requester sees `outcome_unknown` and must inspect state or explicitly act again after a new approval.

## Reconciliation and failures

| Event                                            | Owner behavior                                                                      | Requester behavior                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tailnet peer misses one scan                     | No change                                                                           | Keep current row while reconciling                                 |
| Peer misses two scans / probe fails              | No change                                                                           | Close requester connection and remove Desktop after reconciliation |
| Heartbeat or socket loss                         | Delete connection grants, pending requests, streams, aliases                        | Increment epoch immediately; show disconnected/read-only           |
| Fresh socket, same owner runtime                 | Issue new aliases; Public catalog can return                                        | Replay only read subscriptions; require new control request        |
| Owner restart                                    | New runtime ID; no grants exist                                                     | Treat as a new catalog epoch and read-only connection              |
| Public SSH/WSL/runtime host unavailable          | Keep visibility but publish resource unavailable from validated cached catalog only | Preserve row; opening reports sanitized unavailable state          |
| Worktree disappears                              | Invalidate share epoch; revoke and remove                                           | Remove worktree and close its views                                |
| Same path reappears with a new incarnation proof | Rotate instance ID and persist Private                                              | Old references remain permanently invalid                          |
| Worktree becomes Private during an awaited read  | Cancel/purge stream and discard late result                                         | Remove worktree; never render late content                         |
| Grant revoked during a queued mutation           | Commit/spawn guard rejects if not started                                           | Demote to read; no replay                                          |
| Already-started mutation loses connection        | Process may continue                                                                | Report `outcome_unknown`; do not retry                             |

The requester may retain a last successful Public row during a brief execution-host outage, but never across a visibility/share-epoch change. Cached content is scoped to the same connection/runtime/share generations.

## Privacy and logging

Spool logs protocol versions, node IDs in a redacted/fingerprinted form, connection lifecycle, method class, grant decision, worktree opaque ID, durations, sizes, and sanitized error codes. It does not log:

- Tickets, E2EE keys, auth tokens, cookies, or credentials.
- Absolute worktree/session/file paths.
- Terminal input/output or file contents.
- Account identity or raw provider responses.
- Resume commands, SSH targets, or downstream pairing offers.

Telemetry, if added, records aggregate feature events only and never forms a central discovery/control plane.

## Compatibility and migration

- Existing mobile and runtime pairing wire contracts remain compatible. The E2EE refactor preserves legacy auth frames, channel-bound token mismatch checks, device/client identity, `wsClientIds` close cleanup, and revoke termination semantics while mapping the result to a paired-device principal.
- Missing `spoolVisibility` and `spoolIncarnationId` always mean Private. There is no migration that makes an existing worktree Public.
- Existing sessions gain worktree-instance provenance only when safely observed or created. Unprovable historical records are not shared.
- Git commands retain Git 2.25 as the baseline and use host-scoped capability caches for any newer preferred behavior.
- Paths use Node/Electron host path functions or execution-host Adapters; keyboard labels and shortcuts continue to use platform-aware Orca conventions.
- The requester-to-owner Spool path always terminates at the Owner Desktop even when the selected worktree executes over SSH, WSL, or a paired runtime.

## Verification strategy

Security race tests use controllable barriers between bind, authorize, execute, commit/spawn, await completion, project, and enqueue. They do not use sleeps to hope for a race.

### Unit contracts

- Defensive Tailnet status/whois parsing, CLI location, address normalization, timeout/output caps, and peer deduplication.
- Ticket TTL, one-use consumption, source/node/client-key/runtime/version binding, and replay rejection.
- E2EE principal immutability and compatibility with existing device-token clients.
- Visibility default, atomic project bulk, deny-journal recovery, rename continuity, incarnation-proof mismatch, same-path replacement, and overlap rejection.
- Public-only catalog projection, connection-scoped opaque references, generation handling, session provenance/deduplication, and quota sanitization.
- Session privacy fixtures cover nested roots, identical paths on different execution hosts, stale/cross-worktree provenance, and ambiguous legacy records.
- Recursive fixtures containing email, IDs, auth sources, paths, errors, tokens, cookies, and raw metadata prove those fields/values never serialize.
- Separate Spool RPC registry default denial and the complete bind/access/execute/result/error contract for every entry.
- File containment for traversal, `.git`/administrative metadata denial, symlink escape/retarget, missing-target parent resolution, Windows drives/UNC/case, WSL, SSH, and runtime hosts.
- Git read profile, current-HEAD opaque commit refs, sibling-worktree isolation, and Git 2.25 compatibility.
- Terminal method direction, per-operation grant checks, inactive viewer behavior, OSC/local-side-effect suppression, sequencing, and connection teardown on invalidation.

### Process integration

- One probe/upgrade port; a port collision disables only Spool.
- Ingress binds only current Tailnet interfaces, ignores body/header identity claims, verifies the real socket source, and never redirects a requester to a peer-supplied endpoint.
- Exactly one physical socket carries requests and streaming replies; Spool binary input fails closed.
- Disconnect clears pending approvals/grants and reconnect replays only Public reads.
- A grant cannot move to a second socket on the same node, another channel key, worktree/share epoch, or stale owner decision.
- Requester and owner restart tests separately prove that grants, requests, aliases, streams, and `canControl` never survive.
- Public → Private closes catalog/terminal/file/Git streams and discards reads that finish late.
- Delete, incarnation-proof mismatch, incarnation rotation, and Private invalidate active requests, grants, aliases, and streams through the same path.
- Crash injection after each deny-journal, metadata, and epoch step never publishes uncertain visibility.
- Revoke between authorization and commit/spawn prevents the side effect; revoke after start does not claim rollback.
- Revoke/Private invalidation terminates saturated connections so stale queued replies cannot survive the publication epoch.
- Public file and Git reads never open owner UI or trigger credential/trust/provider prompts.
- The same authorization and symlink-retarget/visibility TOCTOU suite runs against local, WSL, SSH relay, and paired runtime execution.
- Downstream disconnect cleans upstream subscriptions and recursive Spool forwarding is rejected.
- Probe, forwarding, error, and log sentinels prove that tickets, principals, credentials, paths, SSH targets, terminal bytes, and raw errors never escape their allowed boundary.
- Real Git 2.25 and a newer representative binary exercise the Public read profile, fallback cache, concurrent probes, and host isolation.
- Every connection/subscription/result/queue limit rejects cleanly and releases capacity after disconnect.

### Renderer and E2E

- Sidebar projects Desktop → Project → Worktree → every attributable Session, never merges Desktops by person, and shows no session-status pills.
- Light/dark, 220 px sidebar density, truncation, disclosure, virtual scrolling, and quota rows follow `docs/STYLEGUIDE.md` and canonical CSS tokens.
- Public surfaces are consistently read-only; one grant ACK enables all allowed controls; revoke/disconnect/Private disables them in one render turn.
- Approval dialog warning, safe initial focus, cancellation, multi-grant list, and exact revoke action.
- Two fake-Tailnet Desktop processes prove discover → Public read → request → approve → mutate → disconnect → reconnect read-only.
- Real Tailnet smoke tests remain manual/nightly; CI injects an in-memory `TailnetControl` rather than depending on a developer Tailnet.

P0 merge gates are default-deny registry coverage, projection sanitization, terminal mutation commit guards, documented containment/TOCTOU behavior, every loss-of-authority transition, the four execution-host routes, and the two-Desktop reconnect-read-only E2E.

## Delivery sequence

### Slice 1: visibility, projections, and UI shell

- Add the persisted Private-by-default visibility fields, incarnation proof, deny journal, and atomic Store operation.
- Add owner worktree/project visibility actions and first-publication warning.
- Add static/fixture-backed Spool sidebar rows, quota rows, remote route, read-only workspace shell, approval queue, and dynamic `canControl` gates.
- Validate the UX in light/dark and narrow sidebar layouts before networking.

### Slice 2: dedicated ingress and Public reads

- Add `TailnetControl`, `TailscaleCommandAdapter`, peer reconciliation, fixed-port `SpoolIngress`, tickets, immutable principals, and `SpoolPeerConnection`.
- Add Public-only catalog/session/quota projections and generation-bound opaque references.
- Add the default-deny read registry for terminal, file, diff, and Git data.
- Prove local, WSL, SSH, and runtime execution routing and fail-closed unavailable behavior.

### Slice 3: ephemeral control

- Add owner request queue, access authority, multi-grant UI, explicit revoke, and guarded terminal control methods.
- Add guarded file mutations, Git stage/unstage/commit, and Claude/Codex session continuation through the reviewed control registry.
- Add commit/spawn guards, outcome-unknown handling, resource limits, priority invalidation, and reconnect-no-replay tests.

## Expected file ownership

Exact splits may change to respect max-line limits, but these names describe concrete responsibilities:

```text
src/shared/spool/
  spool-wire-contract.ts
  spool-catalog-contract.ts
  spool-access-contract.ts

src/main/spool/
  tailnet-control.ts
  tailscale-cli-locator.ts
  tailscale-command-adapter.ts
  tailnet-peer-directory.ts
  spool-ingress.ts
  spool-ticket-authority.ts
  spool-peer-connection.ts
  spool-desktop-catalog.ts
  spool-worktree-visibility.ts
  spool-worktree-incarnation.ts
  spool-visibility-deny-journal.ts
  spool-share-catalog.ts
  spool-session-catalog.ts
  spool-session-provenance-index.ts
  spool-quota-projection.ts
  spool-access-authority.ts
  spool-rpc-gateway.ts
  spool-rpc-registry.ts
  spool-execution-gateway.ts
  spool-worktree-containment.ts

src/main/ipc/
  spool-sharing.ts

src/renderer/src/store/slices/
  spool-sharing.ts

src/renderer/src/components/sidebar/
  workspace-sidebar-row-projection.ts
  spool-sidebar-rows.ts
  SpoolDesktopRow.tsx
  SpoolProjectRow.tsx
  SpoolWorktreeRow.tsx
  SpoolSessionRow.tsx
  DesktopQuotaRows.tsx

src/renderer/src/components/spool/
  SpoolWorkspaceSurface.tsx
  SpoolTerminalPane.tsx
  SpoolSessionPane.tsx
  SpoolFilesPane.tsx
  SpoolFileTree.tsx
  SpoolFilePreview.tsx
  SpoolGitPane.tsx
  SpoolGitSidebar.tsx
  SpoolGitDiffPane.tsx
  SpoolControlRequestDialog.tsx
  SpoolWorktreeVisibilityDialog.tsx
```

The implementation also changes these existing Seams deliberately:

- `src/shared/types.ts` and `src/main/persistence.ts` for visibility/incarnation metadata and the narrow atomic commit.
- `src/main/index.ts` for composition, cached quota injection, lifecycle, and Windows firewall setup.
- `src/preload/index.ts`, `src/preload/api-types.ts`, and a concrete Spool subscription contract for renderer IPC.
- `src/main/runtime/rpc/core.ts`, `e2ee-channel.ts`, and `runtime-rpc.ts` for immutable principals while preserving paired-device wire behavior.
- `src/main/runtime/orca-runtime.ts` terminal input/viewport seams for final side-effect admission.
- `src/main/runtime/orca-runtime-files.ts`, `orca-runtime-git.ts`, and lower host providers for verified file access, the audited Git read profile, and final side-effect guards.
- Paired-runtime internal RPC for incarnation and verified-file host operations.

Existing runtime/file/Git/PTY Modules do not import Spool catalog or renderer code; the dependency points from the Spool execution gateway toward those Modules.

## Rejected alternatives

- **Use the existing runtime WebSocket port directly:** it mixes Spool tickets with persisted broad-scope device tokens and makes safe review depend on the much larger runtime registry.
- **Fixed discovery port that returns a dynamic RPC port:** it adds a second Tailnet ACL/firewall requirement and still mixes ingress semantics.
- **Use Tailscale Services in V1:** Services require Tailnet administration and advertisement, conflicting with zero-setup peer discovery. See [Tailscale Services](https://tailscale.com/kb/1552/tailscale-services).
- **Scan the Tailnet address range:** slower, noisier, and less authoritative than the Tailscale peer snapshot.
- **Auto-mint a runtime pairing token:** it would silently grant persistent broad runtime authority.
- **Open several sockets and group them into a logical connection:** a terminal-input socket could outlive the socket whose grant was approved.
- **Send global repos/accounts/sessions and filter in the renderer:** any renderer or serialization error would leak Private state.
- **Annotate every existing RPC method with a read/control enum:** existing schemas and results accept raw/global data, and a single enum cannot express binding, projection, streaming, or commit guards.
- **Use raw paths or stable internal IDs as selectors:** they leak topology, invite cross-host confusion, and survive longer than the publication they name.
- **Persist grants or replay them after reconnect:** contradicts the connection-scoped approval model.
- **Treat renderer-disabled controls as authorization:** a modified renderer can still call the network protocol.
- **Promise a worktree sandbox:** a granted terminal is the owner's shell authority.
- **Continuously assign historical sessions by CWD:** path reuse and nested roots can disclose a previous worktree instance.
- **Permit overlapping Public/Private roots:** a parent file tree or Git history can bypass the nested worktree's visibility.

## Architecture closure

The product loop is closed without a central service:

```text
Tailnet peer snapshot
  → verified running Desktop
  → one-use E2EE connection
  → owner-produced Public projection
  → read-only Orca workspace
  → explicit whole-worktree request
  → owner approval for one physical connection
  → owner-side execution using existing credentials/quota
  → revoke or any disconnect
  → automatic return to Public read-only after a fresh connection
```

Implementation can now be decomposed into tickets. Remaining choices such as exact numeric resource caps are tuning constants, not unresolved identity, authorization, persistence, routing, or lifecycle semantics.
