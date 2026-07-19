# Editor experience research: directory opening and LSP

Date: 2026-07-19

This report separates repository observations and externally sourced facts from product recommendations. It covers directory opening from the Yiru CLI and language-server support for the Monaco editor; it does not propose implementation changes outside those two areas.

## Executive recommendation

Yiru should ship directory opening before LSP. The CLI change is comparatively contained, builds on Yiru's existing runtime and workspace activation paths, and immediately removes friction from terminal-driven workflows. LSP is worthwhile, but it is a new execution-host-aware subsystem rather than a Monaco option that can simply be switched on.

| Decision | Recommendation |
| --- | --- |
| CLI surface | Make `yiru open <directory>` canonical, then accept exactly one bare directory as shorthand: `yiru .` and `yiru <directory>`. |
| Window behavior | Reuse, restore, focus, and navigate the existing packaged-app window. Do not add `--new-window` initially. |
| CLI-to-app handoff | Add one atomic runtime operation such as `workspace.openPath`; have the CLI launch the app if needed, wait for the runtime, then invoke that operation. |
| Local scope | First activate an existing managed workspace; next add an unregistered Git directory or plain folder through the same operation. |
| Remote scope | First support the current managed WSL/SSH workspace using authenticated terminal context. Defer arbitrary unregistered remote directories until the execution-host identity and remote path operations can travel end to end. |
| LSP product direction | Build a host-side language-server process service and a renderer-side Monaco adapter. Share one server session per execution host, workspace root, and server configuration. |
| LSP library | Stage 0 selected a thin Yiru Monaco adapter over a maintained JSON-RPC primitive. TypeFox's stable client requires replacing Yiru's Monaco runtime with its VS Code compatibility stack; Microsoft's direct client is not lifecycle-safe at its current alpha. Keep process supervision and host transport Yiru-owned. |
| LSP rollout | Begin with read-only intelligence for one user-configured server, then diagnostics/navigation, completion/hover, safe workspace edits, remote hosts, and only later curated installation. |

## 1. `yiru .` and `yiru <directory>`

### What exists today

**Repository observations**

- The package already exposes a `yiru` executable through the `bin` entry in [`apps/desktop/package.json`](../../apps/desktop/package.json). [`apps/desktop/src/cli/index.ts`](../../apps/desktop/src/cli/index.ts) treats the first positional token as a registered command, so `.` or an arbitrary directory currently becomes an unknown command. The existing [`open` specification](../../apps/desktop/src/cli/specs/core.ts) accepts no directory, and its [handler](../../apps/desktop/src/cli/handlers/core.ts) only starts/waits for Yiru.
- [`apps/desktop/src/cli/runtime/client.ts`](../../apps/desktop/src/cli/runtime/client.ts) already detects a running runtime, launches the desktop app when permitted, and waits until it is available. [`apps/desktop/src/cli/runtime/launch.ts`](../../apps/desktop/src/cli/runtime/launch.ts) launches the bundle or Electron executable without carrying an open target.
- Packaged Yiru already uses Electron's single-instance lock. [`apps/desktop/src/main/startup/single-instance-lock.ts`](../../apps/desktop/src/main/startup/single-instance-lock.ts) discards the second process's arguments and invokes a no-argument callback; [`apps/desktop/src/main/index.ts`](../../apps/desktop/src/main/index.ts) then restores/shows/focuses an existing window or creates one. Development intentionally allows multiple instances.
- The runtime already exposes `worktree.activate` in [`apps/desktop/src/main/runtime/rpc/methods/worktree.ts`](../../apps/desktop/src/main/runtime/rpc/methods/worktree.ts), while [`apps/desktop/src/cli/selectors.ts`](../../apps/desktop/src/cli/selectors.ts) can find the deepest managed worktree enclosing a local current directory. There is no public CLI command that combines a path lookup with activation.
- [`apps/desktop/src/main/runtime/rpc/methods/repo.ts`](../../apps/desktop/src/main/runtime/rpc/methods/repo.ts) and the runtime support both Git repositories and plain folders. The renderer's [`addNonGitFolder`](../../apps/desktop/src/renderer/src/store/slices/repos.ts) already performs the multi-step plain-folder add/fetch/activate flow, but that sequencing is renderer-specific rather than an atomic runtime contract.
- [`apps/desktop/src/cli/repo-path-arguments.ts`](../../apps/desktop/src/cli/repo-path-arguments.ts) resolves local relative paths against the invocation cwd. Paired remote runtimes require absolute paths because the local CLI cwd is unrelated to the server. `YIRU_CLI_CWD` exists specifically so the SSH relay and WSL wrapper can preserve the originating shell's cwd.
- PATH integration is already substantial. [`apps/desktop/src/main/cli/cli-installer.ts`](../../apps/desktop/src/main/cli/cli-installer.ts) installs a macOS or Linux launcher into `/usr/local/bin` or `~/.local/bin` as appropriate, and adds the bundled native Windows launcher to the user PATH. [`apps/desktop/config/electron-builder.config.cjs`](../../apps/desktop/config/electron-builder.config.cjs) packages platform launchers; Debian/RPM hooks install an owned `/usr/bin/yiru` link. [`apps/desktop/src/main/cli/wsl-cli-installer.ts`](../../apps/desktop/src/main/cli/wsl-cli-installer.ts) installs a WSL shim that forwards through the Windows launcher.
- SSH terminal passthrough in [`apps/desktop/src/main/ssh/ssh-remote-cli-host-passthrough.ts`](../../apps/desktop/src/main/ssh/ssh-remote-cli-host-passthrough.ts) forwards CLI arguments to the host-side bundled CLI and preserves a small set of Yiru-owned context variables, including the current worktree/workspace IDs and remote cwd. This is useful for managed remote workspaces, but it does not currently carry a general authenticated execution-host identifier for registering an arbitrary remote directory.

**External reference behavior**

VS Code's official CLI documents `code .`, resolves relative paths from the terminal cwd, and distinguishes reuse/new-window, goto, and wait behavior. Windows and Linux installations add the command to PATH, while macOS offers an explicit shell-command installation action ([VS Code command-line interface](https://code.visualstudio.com/docs/configure/command-line)). These are useful precedents, not requirements to copy every flag.

Electron's official API says the `second-instance` event supplies `argv`, `workingDirectory`, and lock `additionalData`, and recommends restoring/focusing the primary window there. It also warns that Chromium may add or reorder command-line arguments, so exact data should use `additionalData`; macOS file-open events must be registered early ([Electron `app` API](https://www.electronjs.org/docs/latest/api/app)).

### Proposed behavior contract

**Recommendation**

1. Define `yiru open [directory]` as the durable, documented command. With no directory it keeps today's “open/focus Yiru” behavior.
2. Before normal command dispatch, normalize exactly one bare non-option argument to `open <argument>`. Registered subcommands retain priority, and multiple paths, files, `--goto`, `--wait`, and `--new-window` remain rejected/reserved rather than acquiring accidental semantics.
3. Resolve a local relative directory against `resolveInvocationCwd()`. Validate that it exists and is a directory, then obtain a canonical absolute path while retaining a display path for error messages. On Windows, use Node/Electron path and URL utilities rather than manual separators or URI concatenation.
4. If the path lies inside an existing managed worktree or managed plain-folder workspace, activate the deepest containing workspace. Otherwise, for a local directory, discover its Git worktree root and register/activate that root; if it is not Git, register it as a plain-folder workspace and clearly retain Yiru's reduced source-control capabilities.
5. Reuse the current main window. Restore/show/focus it and navigate to the workspace. A directory-open request should be idempotent: opening the active workspace again focuses it without duplicating repository or tab state.

The runtime, not the CLI, should own steps 3–5 through one operation such as:

```text
workspace.openPath({
  path,
  executionHostId?,
  source: "cli"
}) -> { workspaceId, worktreeId, disposition: "activated" | "added" }
```

The CLI should use the existing start-and-wait flow and then call this RPC. That gives warm and cold launches the same observable result, keeps Git/folder detection next to the authoritative repository store, and returns structured errors to the terminal. It also avoids relying on shell quoting or Electron's mutable `argv` for the normal CLI path. A small main-process “open intent” queue can later feed the same operation from OS file associations, deep links, and Electron `second-instance`/`open-file` events once the runtime and renderer are ready.

### Instance, path, and remote semantics

**Recommendation**

- Keep packaged Yiru single-window/single-instance for this feature. Widen the existing second-instance callback only when OS-originated intents are added; use `additionalData` for application-controlled exact payloads and treat raw `argv` as untrusted parsing input.
- Do not resolve a remote POSIX path with the host's `node:path` implementation. Path normalization, canonicalization, existence checks, Git discovery, and registration must execute on the host that owns the workspace: native, a particular WSL distribution, an SSH connection, or a remote Yiru runtime.
- In a Yiru-managed WSL/SSH terminal, prefer the authenticated `YIRU_WORKTREE_ID`/`YIRU_WORKSPACE_ID` context for `yiru .`. It precisely expresses “focus the workspace containing this terminal” and avoids path-translation ambiguity. The bridge must validate that context; user-provided environment variables are not authority.
- For an arbitrary unregistered WSL/SSH directory, extend the relay with an internal connection/execution-host ID and a host-side `workspace.openPath`. Do not silently interpret a remote `.` as a local host folder. A paired CLI outside a managed terminal should require an explicit remote target and an absolute path until a safe selector UX exists.
- Preserve current installer conflict handling and the Windows native launcher. The new syntax only changes argument parsing, so packaged smoke tests should verify argument and cwd preservation through the macOS/Linux shims, Windows launcher, WSL bridge, and SSH passthrough. No new global PATH strategy is needed.

VS Code's official Remote SSH documentation supports the underlying host-affinity model: the remote CLI opens remote files/folders, and most workspace extensions run on the SSH host near the source rather than against a local copy ([VS Code Remote SSH](https://code.visualstudio.com/docs/remote/ssh)). Yiru's exact bridge and trust model remain product decisions.

### Staged delivery

| Stage | Scope | Acceptance boundary |
| --- | --- | --- |
| 1 — managed local | `yiru open <directory>` starts/focuses Yiru and activates the deepest existing local managed workspace. | Running and cold app; spaces/non-ASCII; symlinks; macOS/Linux/Windows; structured not-found/not-directory errors. |
| 2 — local shorthand and add | Add bare `yiru .`/`yiru <directory>` and atomic registration of unregistered local Git roots and plain folders. | No duplicate records; same behavior warm/cold; installer launcher/cwd tests. |
| 3 — managed remote | In Yiru-created WSL/SSH terminals, `yiru .` activates the context worktree/workspace. | Host identity validation; disconnected/removed workspace errors; no local fallback. |
| 4 — arbitrary remote | Carry an authenticated execution-host ID and perform remote path/Git operations on that host. | WSL distro and SSH connection isolation; Windows↔POSIX paths; reconnect/cancellation behavior. |
| Later | OS open events and deliberately designed `--wait`, file, line/column, and new-window semantics. | All input routes converge on the same open-intent service. |

## 2. Language Server Protocol support

### User value and product cost

**Sourced facts**

LSP standardizes JSON-RPC communication between a development tool and a language server. Its current feature set includes document synchronization, completion, hover, signature help, definition/declaration/type-definition/implementation, references, symbols, code actions, formatting, rename, diagnostics, semantic tokens, inlay hints, and more ([LSP 3.18 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/)). VS Code's official guide describes the language client and server as separate processes and notes that static analysis can be CPU- and memory-intensive ([VS Code Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)).

For Yiru users, that means the source editor could progress from syntax-colored text to actionable errors, project-aware completion, documentation on hover, jump-to-definition/references, safe rename, code actions, and workspace symbols. Those features are especially valuable when an agent changes code and a human wants to inspect, understand, or repair the result without switching editors.

**Recommendation and cost assessment**

This is a meaningful product expansion. The visible Monaco provider registrations are the small part. Yiru must also own server discovery/configuration, process supervision, protocol/version correctness, host-specific path and URI mapping, document versioning, diagnostics ownership, workspace edits, user trust, resource limits, status/error UX, and local/WSL/SSH parity. Broad language claims should wait until those foundations work for one real server on each supported host class.

### Current editor stack

**Repository observations**

- Yiru uses `monaco-editor` 0.55.1 and `@monaco-editor/react` 4.7.0 ([`apps/desktop/package.json`](../../apps/desktop/package.json)). [`apps/desktop/src/renderer/src/components/editor/monaco-editor.tsx`](../../apps/desktop/src/renderer/src/components/editor/monaco-editor.tsx) retains models by file path and already integrates save, content synchronization, annotations, diagnostic decorations, and a small Markdown completion provider.
- [`apps/desktop/src/renderer/src/components/editor/editor-content.tsx`](../../apps/desktop/src/renderer/src/components/editor/editor-content.tsx) hosts source edit, diff, rich Markdown, preview, image, CSV, and notebook experiences. LSP should initially attach only to real filesystem-backed source models in edit mode, not partial diff hunks, review/check views, previews, or the Tiptap-based rich editor.
- [`apps/desktop/src/renderer/src/lib/monaco-setup.ts`](../../apps/desktop/src/renderer/src/lib/monaco-setup.ts) deliberately disables Monaco's built-in TypeScript/JavaScript diagnostics because the sandboxed worker cannot resolve project imports and produces false positives for partial diff models. This is direct evidence that project intelligence needs an execution-host-aware server and careful model eligibility, not re-enabling the browser worker globally.
- Open-file state already records absolute path, worktree ID, and `runtimeEnvironmentId` in [`apps/desktop/src/renderer/src/store/slices/editor.ts`](../../apps/desktop/src/renderer/src/store/slices/editor.ts). [`apps/desktop/src/renderer/src/runtime/runtime-file-client.ts`](../../apps/desktop/src/renderer/src/runtime/runtime-file-client.ts) routes read/write/watch operations to the owning local or remote runtime and rejects paths outside its owning worktree. LSP workspace edits should go through this ownership and conflict machinery rather than writing renderer-local paths.
- The main process has filesystem, Git, and PTY abstractions in [`apps/desktop/src/main/providers/types.ts`](../../apps/desktop/src/main/providers/types.ts), but no managed raw-stdio child-process service appropriate for LSP. A PTY is the wrong transport because terminal framing and decoration can corrupt a protocol byte stream and its lifecycle semantics differ from a background service.
- Monaco currently receives an absolute filesystem path as the model `path`. The same path string can exist on different SSH/WSL/runtime hosts, and correct Windows/UNC `file:` URIs require URL-aware construction. LSP therefore needs separate Yiru model identity and server-facing URI mapping keyed by execution host; a raw path string is not a globally unique document identity.

Monaco's own project states that it is generated from VS Code sources but VS Code extensions do not automatically run in Monaco ([Monaco Editor repository](https://github.com/microsoft/monaco-editor)). Its API exposes provider registration points, but Yiru still needs a language client to translate those calls and document events into LSP.

### Feasible architecture

**Recommendation**

```text
Monaco models/providers
        ↕ renderer language-client adapter
authenticated Yiru stream (messages, cancellation, backpressure)
        ↕ execution-host LSP service
server process over clean stdio ── workspace files on the same host
```

1. **Renderer adapter.** Maintain sessions keyed by `(executionHostId, workspaceRoot, serverConfig)`. Register only the Monaco providers advertised in the server's initialize result. Translate between host-qualified Yiru model IDs and the server's native `file:` URIs. Share a session across tab groups and models; never start a server per editor component.
2. **Execution-host service.** Add a narrow managed process API with argv arrays, cwd, sanitized environment, stdio byte framing, cancellation, exit notification, bounded restart, and shutdown timeout. Keep it outside the renderer. Avoid a general shell string API.
3. **Transport.** Local native can use child-process pipes. WSL should spawn inside the selected distribution with Linux cwd/paths. SSH should start the server on the SSH host through a narrow authenticated relay stream. A remote Yiru runtime should expose the same service over its existing authenticated runtime connection. Messages need session IDs, size limits, backpressure, cancellation, and crash/disconnect signals.
4. **File operations.** Reads performed by the server stay host-local. Server-requested workspace edits must be validated, converted back to Yiru-owned document IDs, and applied through runtime file operations so dirty drafts, external-change detection, permissions, and remote ownership remain coherent.

Running the language server beside the workspace is both the practical way to give it project-level filesystem access and consistent with VS Code Remote SSH's documented model of running most workspace extensions remotely ([VS Code Remote SSH](https://code.visualstudio.com/docs/remote/ssh)).

### Client-library options

| Option | Evidence | Assessment |
| --- | --- | --- |
| TypeFox `monaco-languageclient` | The project provides Monaco-to-language-server packages and JSON-RPC/WebSocket integration ([primary repository](https://github.com/TypeFox/monaco-languageclient)). | Best production candidate to spike first, subject to compatibility, bundle size, disposal, and provider-coverage tests against Monaco 0.55.1. Its VS Code API compatibility layer may be more machinery than Yiru needs. |
| Microsoft `monaco-lsp-client` | Microsoft now publishes an in-repository client but labels it alpha and warns of bugs ([primary repository](https://github.com/microsoft/monaco-editor/tree/main/monaco-lsp-client)). | Valuable comparison because it follows Monaco directly; alpha status makes it a spike, not a production commitment. |
| Thin Yiru adapter over JSON-RPC | Directly implement only the LSP features Yiru enables. | Smallest conceptual dependency surface, but deceptively expensive: synchronization, cancellation, dynamic registration, capability negotiation, edits, and edge cases become Yiru's maintenance burden. Do not choose this without spike evidence that existing clients cannot fit. |

Whichever adapter wins, do not let it own server installation or process transport. A Yiru-owned host service makes the security boundary explicit and allows changing renderer libraries without rebuilding remote execution.

### Stage 0 spike result

**Recorded decision, 2026-07-19**

Use a thin Yiru-owned Monaco adapter for the deliberately narrow Stage 1 surface: static capability negotiation, incremental document synchronization, Hover, Go to Definition, request cancellation, and clean shutdown. Use a maintained JSON-RPC implementation for request routing and cancellation rather than maintaining that generic layer. Keep the adapter behind a session interface so it can be replaced if Microsoft's client matures.

This decision is based on disposable Electron/Vite harnesses against Yiru's Monaco version, not API-shape review alone:

| Candidate | Runtime result | Integration and bundle result |
| --- | --- | --- |
| TypeFox `monaco-languageclient` 10.7.0 | Its classic client synchronized two documents, propagated cancellation, sent `shutdown`/`exit`, stopped synchronization after disposal, and handled model close. | Correct synchronization required initializing the `@codingame/monaco-vscode-*` services and opening documents through `EditorApp` model references; raw models from Yiru's existing `monaco-editor` runtime were not observed. The runnable classic harness emitted a 7.62 MB main chunk, about 344 kB of CSS, an extension-host worker, editor worker, service worker, themes, and other VS Code assets (13 MB total output). Adopting it would be an editor-runtime migration, not an LSP add-on. |
| Microsoft `@vscode/monaco-lsp-client` 0.1.0 alpha, source commit `13f0c872` | It synchronized multiple models and translated Hover when forced onto one Monaco singleton. It exposed no `dispose`; a second client caused the first client to keep sending `didOpen`, and canceling a Hover emitted no `$/cancelRequest`. Static boolean Hover/Definition capabilities are also passed to code that expects registration-option arrays. | The adapter-only build was 90.53 kB (17.41 kB gzip), but it peers on `monaco-editor-core`, while Yiru uses `monaco-editor`; the spike needed explicit deduplication to avoid separate model/provider registries. Its lifecycle and capability defects rule it out despite the smaller dependency graph. |
| Thin Yiru adapter | A 7.32 kB (2.46 kB gzip, Monaco external) prototype connected through JSON-RPC to the user's installed Apple clangd 21.0.0, synchronized multiple dirty models, returned real Hover Markdown, and resolved Go to Definition to line 1 of the source file. | It used Yiru's existing `monaco-editor` singleton directly and needed no VS Code compatibility runtime. This validates the seam, not a license to implement the whole protocol: unsupported dynamic registrations and server-to-client operations must remain explicit and fail closed. |

The spike also exposed a required URI rule: clangd canonicalized `/tmp` to macOS's `/private/tmp` in a definition response. Production navigation must compare and authorize canonical host paths rather than assuming returned URI strings exactly match the originally opened model URI.

The TypeFox client remains the reference for lifecycle behavior, and Microsoft's alpha remains worth rechecking. Neither should own Yiru's host process or transport boundary.

### Stage 1 local implementation

**Recorded implementation, 2026-07-19**

The local read-only slice now runs one explicitly configured server per local worktree and configuration. Main owns no-shell process launch, bounded stdio framing, process-group cleanup, canonical workspace authorization, stderr logs, and WebContents session ownership. Preload exposes only session transport and canonical URI/location resolution; renderer owns initialization, static capability checks, incremental model synchronization, cancellation, Hover, Definition, and graceful shutdown. Server-requested edits are rejected, unsupported requests receive JSON-RPC method errors, and remote runtime models do not attach.

A production UI smoke test against Apple clangd 21.0.0 reached Ready, rendered real Hover content, navigated F12 to the definition, and observed an unsaved `didChange` edit before navigation. Terminating clangd moved the status to Error while retaining its stderr log, and closing the owning window terminated the replacement server process. This completes the Stage 1 native-host slice; WSL and SSH remain later host-service work rather than renderer exceptions.

### Stage 2 language intelligence

**Recorded implementation, 2026-07-19**

The renderer adapter now maps push diagnostics, completion, signature help, references, and document symbols onto the existing Monaco singleton. Diagnostic marker ownership is isolated per server session, explicit document versions must match the current dirty model, and markers are cleared on close, failure, or disposal. Completion accepts only the user-selected primary edit; additional edits, commands, and lazy resolution remain deferred to the controlled-edits stage. Returned reference locations still pass through the same host canonicalization and workspace authorization as Definition.

A server crash now clears stale markers, retains the prior stderr log, and reopens current dirty models after bounded restarts at 500 ms and 2 seconds. The budget resets only after a minute of stable service, preventing tight spawn loops while allowing later recovery. A production smoke test against Apple clangd 21.0.0 rendered an error diagnostic, returned completion and signature help, exposed references and two document symbols, restored diagnostics after each of two permitted restarts, and remained visibly failed after a third forced crash exhausted the budget.

### Stage 3 controlled edits

**Recorded implementation, 2026-07-19**

Rename, code actions, document/range formatting, and text-only workspace edits now map onto Monaco. Rename preparation is capability-gated, formatting remains an explicit single-buffer undoable operation, and code actions that require server-side command execution remain disabled. Apple clangd's `clangd.applyFix` is narrowly supported by extracting its single `WorkspaceEdit` argument into the same preview pipeline without executing the command. Yiru still rejects unsolicited `workspace/applyEdit` requests; edits are accepted only as the direct result of the user's Rename or Code Action request.

Multi-file edits first resolve every server URI through the host's canonical workspace authorization. The renderer then rejects resource operations, stale document versions, overlapping or invalid ranges, binary/oversized files, unsynchronized open tabs, external-mutation conflicts, and edits beyond 50 files, 1,000 ranges, or 5 MB of preview content. A modal shows a per-file diff before applying. Open-buffer changes use Monaco's undo stack and normal save/autosave flow; closed files are written with pre-apply content checks, and a partial write failure rolls back files only when their contents still match Yiru's write, avoiding overwriting a racing third-party change. At the time this stage landed, closed-file transactions remained native-host-only pending execution-host parity.

A real-app smoke test against Apple clangd 21.0.0 formatted an intentionally compressed C function, previewed and applied the `#include <stdio.h>` quick fix, and previewed a three-file rename with two closed-file writes. Changing a closed file while the preview was open rejected the whole plan without touching the other files. Making the second closed target unwritable forced a mid-transaction failure and restored the first file before surfacing the write error.

### Stage 4 execution-host parity

**Recorded implementation, 2026-07-19**

The host service now resolves each registered worktree to its actual native, WSL, or SSH execution host before starting a server. Native processes retain direct argv spawning and process-group cleanup. WSL uses `wsl.exe` with a separately escaped login-shell invocation and Linux cwd/URIs. SSH uses the active authenticated connection, remote-platform-aware POSIX or PowerShell quoting, and the channel's raw stdin/stdout/stderr. The session manager itself is owner-based rather than Electron-specific, so the same framing, limits, logs, canonical authorization, and stop policy are reused by desktop IPC and runtime RPC.

Remote runtimes advertise `language-server.v1` and expose authenticated start/send/stop/location/log/event methods. The renderer keeps the Monaco adapter behind a replaceable transport and sends the user-selected server configuration to the owning runtime rather than attempting to run that executable on the desktop. Sessions remain qualified by worktree, runtime/SSH owner, and configuration; runtime event streams use authenticated principal plus an unguessable client ID so dedicated and shared-control sockets cannot cross-wire ownership.

Server-facing `file:` URIs now use the owning host's POSIX or Windows path flavor. Every open or returned location is canonicalized on that same host and checked against the authoritative worktree before being mapped back to the renderer's display path; this covers native symlinks, WSL UNC-to-Linux conversion, SSH realpaths, Windows drive paths, UNC paths, and URI escaping. Controlled-edit reads, revalidation, writes, self-write suppression, and race-aware rollback now route through local/SSH filesystem APIs or the owning runtime's file RPC, so multi-file Rename and Code Actions no longer fall back to the desktop filesystem.

Disconnects surface as failed sessions and retain the existing 500 ms / 2 s bounded restart budget rather than spawning indefinitely. SSH connection-state changes reattach the document, and closing/reopening a tab explicitly resets a spent budget after either an SSH or runtime reconnect. Unsolicited `workspace/applyEdit`, resource operations, arbitrary commands, and all Stage 3 size/version/conflict limits remain unchanged.

The native adapter regression was exercised through the host manager, including `/tmp` to `/private/tmp` canonical mapping and graceful stop. A separate path harness round-tripped POSIX paths, Windows drive paths, UNC paths, spaces, `%`, and `#`, and rejected an out-of-workspace path. Node/renderer type checks, repository contracts, localization checks, max-line ratchet, and the Electron Vite production build pass. Live WSL, SSH POSIX/Windows, and remote-runtime server matrices remain release-validation work rather than claimed test coverage.

### Protocol lifecycle and editor mapping

**Sourced protocol requirements**

LSP messages use JSON-RPC with `Content-Length` framing. `initialize` is the first request, followed once by `initialized`; client and server exchange capabilities there. Open documents use `textDocument/didOpen`, changes use the server's negotiated full or incremental synchronization with monotonically increasing versions, save/close use their corresponding notifications, and normal termination is `shutdown` followed by `exit` ([LSP 3.18 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/)).

**Recommended Yiru mapping**

- Start and initialize a server lazily when the first eligible document opens. Send the native workspace root URI and only capabilities Yiru really implements.
- Send `didOpen` once per server document. Serialize `didChange` in version order; cancel stale completion/hover/navigation requests but never reorder document synchronization.
- Map `publishDiagnostics` to a stable Monaco marker owner per server session. Drop stale-version diagnostics where the protocol/server supplies enough information, and clear markers on close, server stop, or ownership change.
- Route completion, hover, signature, definition/references, symbols, semantic tokens, and other features only after their capabilities are advertised. Unsupported server-to-client requests should fail explicitly rather than hang.
- Treat `workspace/applyEdit`, file create/rename/delete, `workspace/configuration`, messages, progress, and `workspace/executeCommand` as separate product/security surfaces, not automatic pass-throughs.
- On last-document idle timeout or workspace close, send `shutdown`, then `exit`; force-kill after a bounded timeout. Restart crashes with a small backoff/budget and expose status plus logs rather than looping silently.

### Discovery, installation, security, and resources

**Recommendation**

Start with user-managed server configuration scoped to an execution host:

```text
language IDs; executable; argv; environment allowlist;
workspace-root markers; initialization options; host selector
```

Probe the executable on the selected apps/desktop/native/WSL/SSH/runtime host and show “available”, “missing”, or “failed” with the actual host name. Do not auto-download servers in the first release. Later curated installers should require explicit consent and pin a version/checksum per OS, architecture, and host, with proxy/offline behavior and an owned install directory. Project-local executables and workspace-provided server configuration must be treated as code execution, not harmless editor metadata.

Minimum controls:

- ask once per workspace and execution host before launching an untrusted/project-local command;
- accept executable plus argv, never a shell command string; minimize inherited environment and redact secrets from logs;
- validate every requested URI and edit against authorized workspace roots and the expected execution host;
- require confirmation for create/delete/rename outside already open files and for server `executeCommand` actions until explicitly allowlisted;
- cap message/output size, concurrent requests, log retention, restart count, and idle lifetime; provide cancellation/timeouts and resource/status visibility;
- isolate sessions by SSH connection, WSL distribution, and remote runtime, and tear them down on disconnect or authorization loss.

Electron also recommends validating IPC message senders and limiting exposed capabilities ([Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)); Yiru's renderer-to-host LSP bridge should follow that narrow-capability approach.

### Incremental roadmap

| Stage | Product slice | Exit criterion |
| --- | --- | --- |
| 0 — protocol spike (complete) | Compared both client libraries with disposable fixture harnesses and Apple clangd 21.0.0; tested multiple Monaco models, disposal, framing, cancellation, and bundle impact. | Selected a thin replaceable Yiru adapter; recorded evidence above. |
| 1 — local, read-only intelligence (complete) | Native host process service; user-configured server; initialize/sync/shutdown; source-edit models only; Hover and Definition. | No writes/commands; status and logs; correct dirty-buffer synchronization. |
| 2 — diagnostics and completion (complete) | Diagnostics, completion, signature help, references, symbols, cancellation, bounded restart. | Stale results do not overwrite newer models; built-in diagnostics remain isolated from LSP marker ownership. |
| 3 — controlled edits (complete) | Rename, code actions, formatting, and text-only workspace edits with a per-file preview and confirmation. | Stale/invalid/out-of-workspace edits fail closed; dirty/conflicted buffers are guarded; partial closed-file writes use race-aware rollback. |
| 4 — execution-host parity (implemented) | WSL, SSH, and remote-runtime process/stream implementations; host-qualified URI mapping; execution-host closed-file transactions. | Sessions are host-qualified; disconnect/reconnect is bounded and visible; live host/server matrices remain release validation. |
| 5 — curated languages | Explicit-consent, checksummed host-scoped installation for a small demand-driven language set; semantic tokens/inlay hints where useful. | Support matrix names tested server versions, hosts, features, limits, and uninstall path. |

## Decisions before broader rollout

1. Confirm single-window reuse as the initial directory-open contract and keep file/line/new-window/wait behavior out of scope.
2. Decide whether an unregistered path inside a Git worktree should open the Git root (recommended for Yiru's repo/worktree model) or create a distinct plain-folder workspace at the literal directory.
3. Approve managed-workspace-only remote opening before arbitrary remote path registration; the latter requires an authenticated execution-host identity in the relay.
4. Fund LSP as a host/runtime capability, not an editor-only feature, and choose the first real language server based on observed user demand after the protocol spike.
5. Define the workspace-trust and server-installation policy before enabling project-local binaries or server-requested commands/edits.
