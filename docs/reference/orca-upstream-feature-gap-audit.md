# Orca upstream feature-gap audit

Audit date: 2026-07-24. This audit compares every non-merge commit in
`13c690b05..817197fc3` against the current Yiru working tree. The range contains
412 non-merge commits; the matrix below contains every commit whose diff adds,
exposes, restores, or materially expands a user-operable product capability.

## Machine-readable contract

Each candidate is one Markdown table row and each commit appears once. The
`Status` value is one of exactly `migrated`, `equivalent`,
`intentional-divergence`, or `still-missing`:

- `migrated`: the migration wave added the capability to the current working
  tree, which may still be uncommitted.
- `equivalent`: Yiru already had the behavior or has an independently
  implemented contract with the same user outcome.
- `intentional-divergence`: the commit belongs to Linear, Jira, Tasks,
  Workspace Board, or the dashboard popout on that removed surface.
- `still-missing`: source and behavior probes found no complete Yiru
  implementation.

Release commits, translations that only correct wording, tests, documentation,
refactors, performance-only work, build/CI changes, reverts, and correctness
fixes that do not add or expand a product capability were inspected but are not
candidate rows. A commit titled `fix` is included when its diff enables a new
host, provider, file type, protocol, workflow, or user action; a commit titled
`feat` is not automatically included when it is telemetry-only.

## Capability matrix

| Commit | Status | Capability | Yiru evidence / divergence |
| --- | --- | --- | --- |
| `c5d2275c3` | `migrated` | Preference to show pinned worktrees in their original lists | Persisted settings, host-correct row selection, drag/sleep projections, Settings search, and focused sidebar tests are present. |
| `44686f324` | `migrated` | Mobile default-view toggle for Chat UI | `settings/native-chat-experimental-setting.tsx`, shared defaults, mobile preference delivery, and locales are present. |
| `ba25e4306` | `equivalent` | Explicit Chat UI turn lifecycle markers | Yiru's `use-native-chat-send-lifecycle.ts` and transcript reconciliation use explicit pending/completion state rather than assistant-prose inference. |
| `14116e357` | `intentional-divergence` | Unified skill status plus Linear agent-skill section | The unified installed-skill model exists; the Linear-only section is intentionally absent with the removed integration. |
| `590781645` | `equivalent` | Common Ctrl/Cmd tab-switch keybindings for new users | `shared/keybindings.ts` defines the common Ctrl+Tab/PageUp/PageDown family with platform-aware labels. |
| `546cc8237` | `equivalent` | Improved Chat UI session options and composer behavior | Current `components/native-chat` owns view selection, session options, pending state, and composer lifecycle. |
| `3f335efdb` | `migrated` | Pi provider-session capture and resume | Pi hook metadata, persisted sleeping-agent compatibility, and resume argv coverage are in `agent-hooks/server.ts` and focused tests. |
| `ed28dec59` | `migrated` | Always offer Add a new project in the create-worktree picker | `new-workspace/project-combobox.tsx` renders the action independently of search results. |
| `c436df055` | `migrated` | DEV indicator and instance label on tray icons | `main/tray/tray-dev-badge.ts` stamps development tray artwork and `system-tray.ts` applies localized instance labels, with focused tests. |
| `45c4a1f61` | `equivalent` | Create-review intent handles commit/publish preparation | The current Source Control create-review intent stages, generates, commits, publishes, and revalidates the owning worktree. |
| `72d0a403a` | `equivalent` | Monaco protobuf language for `.proto` | `renderer/src/lib/language-detect.ts` maps `.proto` to `protobuf`. |
| `4930c8721` | `equivalent` | Load review details on fork checkouts from upstream | Yiru's generic hosted-review lookup resolves upstream remotes and is not GitHub-only. |
| `4905b7828` | `equivalent` | Live reset countdown in collapsed usage UI | The usage roster uses `use-reset-countdown-clock.ts` for collapsed and expanded usage. |
| `6a573f376` | `migrated` | Keep create-worktree composer open while adding a project | The migrated project combobox delegates to the add-project flow without dismissing the composer. |
| `02ff7c746` | `equivalent` | Preserve agent chats and drafts through reconnects | Chat drafts and pending turns are scope-keyed and retained across runtime reconnects. |
| `8ed8f0d10` | `migrated` | Download SSH folders recursively from the explorer | `ssh-filesystem-download.ts`, `fs:downloadFolder`, preload types, explorer action, and tests are present. |
| `e074bc3f0` | `equivalent` | Gate certificate-trust proceed action on runtime capability | Runtime capability contracts gate client actions before dispatch; unsupported remote runtimes fail closed. |
| `e885cec15` | `equivalent` | Hide the Mobile sidebar button after pairing | `sidebar/sidebar-nav.tsx`, `showMobileButton`, Settings, and menu wiring provide the behavior. |
| `8d5c67464` | `equivalent` | Launch Store-installed PowerShell 7 | `providers/windows-powershell-executable.ts` resolves Store aliases and real installs with a safe fallback chain. |
| `b4e85d95a` | `equivalent` | Toggle H5 in the rich Markdown editor | H5 is registered in the heading slash commands, context routing, and toolbar. |
| `500f0c50d` | `migrated` | Reject duplicate Claude accounts per organization and runtime | This audit added `claude-duplicate-account.ts`; the account service now checks normalized host/WSL identity before durable writes. |
| `37cd83019` | `equivalent` | Confirm before merge from the review strategy dropdown | Orca reverted this in `0e7b0ac22`; Yiru matches the final upstream endpoint behavior. |
| `624c8d412` | `equivalent` | Click plain-text `file://` terminal links | `terminal-file-url-target.ts` and terminal OSC/plain-text routing open file URIs inside Yiru, including UNC forms. |
| `08f446190` | `equivalent` | Consistent per-repo Source Control AI save UX | Current Source Control AI settings use repo-scoped state and shared save controls. |
| `c5d40565a` | `equivalent` | Clear Mobile LAN/Tailscale pairing paths | Current pairing screens distinguish LAN, private-network, and relay/Tailscale routes. |
| `d67ede159` | `equivalent` | Confirm-only create-review composer with classified blockers | Current hosted-review eligibility and `source-control-create-review-blocked-action.ts` classify and present blocking states. |
| `245d79cc8` | `equivalent` | Preserve surviving workspace state when a runtime host is removed | Host cleanup removes owner-scoped rows while retaining workspaces owned by surviving runtimes. |
| `daf22f072` | `migrated` | Create review automatically fast-forwards behind-only branches | Shared review policy admits only behind-only branches, runs an owner-routed `ff-only` step before staging, and preserves supersession/provider behavior in focused tests. |
| `1def694e8` | `migrated` | Host-aware Chat UI skill discovery and picker | Discovery covers local, WSL, runtime, web, and direct SSH: SSH clients capability-gate `skills.discover.v1`, then delegate through the active relay to scan the remote cwd. |
| `e3721e8cf` | `equivalent` | Pi `ask_user_question` maps to blocked/Needs You | Pi hook status parsing and agent-state projection recognize the tool state. |
| `5fcf77761` | `migrated` | Mobile Quick Commands for terminal commands and agent prompts | Mobile list/editor/sheet/launch, runtime RPC delivery, persistence, and focused model tests are present. |
| `4d49b9342` | `equivalent` | Forward project/worktree setup variables into WSL | WSL launch command construction carries Yiru root/worktree context across `wsl.exe`. |
| `ccd72f590` | `equivalent` | Unified Mobile session/notification onboarding | Mobile pair completion, notification opt-in, first-run routing, and recovery gates are implemented. |
| `aca7d50ba` | `equivalent` | Do not attach stale closed reviews to default branches | Hosted-review cache reconciliation validates live review state before associating it with a branch. |
| `f8b430f72` | `equivalent` | Ship the product CLI as a hybrid skill stub | Yiru ships the equivalent `yiru-cli` hybrid skill rather than an Orca-branded stub. |
| `e58de71f5` | `migrated` | Codex real-home routing and self-contained multi-account homes | Current codex-account runtime-home service covers native, WSL, and remote routing with per-account homes. |
| `d19cb8bc4` | `migrated` | Require an explicit Codex account-switch action | An unresolved Codex restart notice exposes Restart only; collapse and dismiss paths are absent. |
| `f655ae392` | `migrated` | Resolve OMP identity from the outer wrapper | Pi/OMP hook handling projects the outer terminal identity and preserves it through resume. |
| `c45dc62ea` | `migrated` | Flag signed-out system-default Codex account | The system-default row warns for `authKind: none`, while API-key/custom-provider setups remain explicitly exempt. |
| `fec996a54` | `migrated` | Preserve active Codex account during reauthentication | Reauthentication captures and restores the selected host or WSL account lane on both success and failure. |
| `bf7fbdd57` | `migrated` | Trust linked worktrees before Codex launch | Local and SSH trust presets validate reciprocal linked-worktree metadata, resolve the main-repository root on POSIX/Windows, and reject malicious mismatches. |
| `0ed1d04b3` | `migrated` | Migrate legacy shared-home Codex sessions before resume | Codex account migration promotes legacy session data into the selected account home. |
| `3468b434d` | `intentional-divergence` | Agent-dashboard popout | The popout belongs to the intentionally removed Workspace Board/dashboard surface. |
| `580f8eb49` | `migrated` | Consolidated agent usage roster | `status-bar/usage-roster-panel.tsx` replaces separate provider presentation and has focused tests. |
| `6444be3a0` | `migrated` | Runtime-aware WSL provider account detection | Provider-account discovery and selection are scoped to the executing WSL runtime. |
| `971b16754` | `equivalent` | GitHub Enterprise review diffs | Generic hosted-review remote/auth handling preserves GHES hosts and loads provider diffs. |
| `085fc6ad8` | `equivalent` | Embedded-browser commands stay on the registered product target | Yiru browser commands bind to registered Yiru browser pages and worktree ownership. |
| `ede57cf72` | `equivalent` | Paste copied image files on Windows | Clipboard file extraction and image attachment routing handle Windows file payloads. |
| `e3c8d9663` | `migrated` | Access the Floating Workspace from Mobile | Mobile now has gated synthetic-workspace navigation, repo-free sessions, host-aware agent loading, route-reuse safety, PTY liveness, and focused tests. |
| `1293e1c0d` | `equivalent` | Mixed-version Mobile Codex resume | Versioned runtime session contracts and compatibility gates preserve resume across paired-client skew. |
| `91ee29a80` | `migrated` | Editor font family setting that follows terminal font by default | Shared settings, persisted codec, Settings field, Monaco/diff consumers, locales, and tests are present. |
| `6785f9d1a` | `intentional-divergence` | Dashboard popout open-worktree control and finished-time parity | Popout control is on the removed surface; reusable finished-time behavior already exists in the compact agent row. |
| `63da95881` | `equivalent` | Repository-scoped GitHub work-item searches | Work-item resolution carries repository identity rather than searching an account globally. |
| `22d9c8787` | `migrated` | Codex automatic resume across account switches | Resume launch selects the captured account home before invoking Codex. |
| `c24ebcade` | `equivalent` | Accurate Claude Limited state from Retry-After/statuslines | Rate-limit ingestion combines API responses with live statusline usage. |
| `2add99c44` | `equivalent` | Commit generation remains available for custom commands | Source Control commit generation is independent of the configured commit command. |
| `a97c16036` | `equivalent` | Preserve non-default GitHub Enterprise auth ports | Hosted-provider host normalization retains explicit ports. |
| `1bebb2401` | `migrated` | Detailed/Compact usage mode tooltips | The usage roster exposes density selection and explanatory tooltips. |
| `48578a85e` | `intentional-divergence` | Link Linear capabilities to Integrations settings | Linear integration was intentionally removed. |
| `be066fe8e` | `intentional-divergence` | Linear issue activity history | Linear integration was intentionally removed. |
| `42a4f017b` | `intentional-divergence` | MCP-compatible Linear issue listing | Linear integration was intentionally removed. |
| `87af1c867` | `intentional-divergence` | Linear issue relations | Linear integration was intentionally removed. |
| `a10a2ba53` | `intentional-divergence` | MCP-style Linear issue save | Linear integration was intentionally removed. |
| `7ca3e670c` | `migrated` | Include per-account Codex homes in usage/removal scope | Usage scanning enumerates every ownership-marked host account home and de-duplicates canonical roots before reading transcripts. |
| `d8378e8ec` | `equivalent` | Correctly label a WSL default shell | Shell labels are derived from the remote/WSL shell family rather than the Windows host shell. |
| `e986a7ba1` | `migrated` | Surface nested Codex subagents | Codex hook identity, roster reconciliation, shared types, sidebar/dashboard rows, and focused tests are present. |
| `1fef1e1dd` | `equivalent` | Safely relaunch macOS headless serve after updates | Yiru's headless server/update lifecycle separates install, disconnect, and relaunch ownership. |
| `44f77a3b7` | `migrated` | Continue agent work in a new session | `agent-session-continuation` provides selection, dialog, and launch behavior. |
| `e60060039` | `equivalent` | Show setup-needed hosts in the workspace run picker | Runtime host options include compatibility/health state and retain empty hosts as picker choices. |
| `c4d903ff2` | `equivalent` | Keep Claude in-process teammates visible as idle rows | Claude subagent roster and row-lifecycle projection retain child identities after activity ends. |
| `1a9e819c4` | `equivalent` | Remaining bundled hybrid skill stubs | Yiru ships branded equivalents through its bundled skill guide/catalog pipeline. |
| `4c2bb508c` | `equivalent` | Find Language setting with native-language terms | `settings/appearance-search.ts` includes native names and localized aliases. |
| `0121f571e` | `migrated` | Codex `request_user_input` maps to Needs You | Codex status parsing and the shared question glyph state are present. |
| `24b8fcc91` | `equivalent` | Restore last-open Mobile tab per worktree | Mobile session routing persists and restores the selected tab. |
| `405b9f245` | `migrated` | Mobile protocol-block screen | `apps/mobile/src/components/protocol-block-screen.tsx` is mounted by the host route. |
| `56a31a5af` | `equivalent` | Show the current branch in Source Control | The initial Orca change was reverted, then re-landed by `94d3db4a2`; Yiru's current header receives `branchName`. |
| `d6c9fcd53` | `migrated` | Surface pairing-auth failures on desktop and Mobile | Pairing state and Mobile host gates present actionable authentication failures. |
| `034aeb15e` | `migrated` | Seed Monaco Find from selected text | `editor/monaco-find-options.ts` configures selection seeding with a focused test. |
| `b63d4cde2` | `migrated` | Amber question glyph for Needs You everywhere | Shared agent-state dots and sidebar status indicators use the question glyph for permission/question waits. |
| `11310eef6` | `migrated` | Keep the Mobile Quick Commands button stable during capability load | The action remains visible for unknown/loading capability state and hides only after the paired host is known unsupported. |
| `43ae014a6` | `equivalent` | iOS emulator accessibility-tree command | Yiru's emulator bridge and bundled skill expose `emulator ax`. |
| `adc020393` | `migrated` | Open SSH workspaces through VS Code Remote-SSH | SSH authority resolution, launcher contract, runtime capability, preload, and focused tests are present. |
| `908020581` | `equivalent` | Authenticate OpenCode Go usage through a cookie jar | Current provider usage fetchers preserve the authenticated session transport. |
| `c8381f3ea` | `migrated` | Preserve Codex TUI settings across managed-home remirrors | The first Orca attempt was reverted and re-landed in `ef985ed80`; Yiru uses anchored config mirroring. |
| `0326594d5` | `migrated` | Update paired headless servers from the active desktop client | Authenticated updater RPC and a canonical macOS packaged-CLI supervision handoff persist the install intent, relaunch, and verify replacement identity/version; unsupervised, SSH, Linux, and Windows serve modes remain safely manual. |
| `6d55c7fa1` | `equivalent` | Rename Native Chat to Chat UI | Supported user-facing Yiru copy uses Chat UI while internal module names remain stable. |
| `9500ca7a6` | `equivalent` | Show attached images in Mobile rich chat | Mobile attachment input and chat rendering retain image metadata across sends. |
| `059a80b29` | `migrated` | Assignable Send Review Notes to Agent shortcut | The global unbound action is registered in `shared/keybindings.ts` and dispatches through application/store state to both review-notes menus, with focused tests. |
| `fc05769ed` | `migrated` | Permit blank SSH user in VS Code authority | Manual usernames are optional, non-empty values are validated, and an empty value emits the bare host authority without `@`. |
| `ee6319ebe` | `equivalent` | Scope Settings agent list and quick launch to the selected host | Runtime-backed agent discovery and picker options carry execution-host ownership. |
| `4a9affd6e` | `equivalent` | iOS accessibility tree through plain-JSON serve-sim helper | Yiru materializes and controls the helper process through the emulator bridge. |
| `1d8ce38a5` | `intentional-divergence` | Size dashboard-popout terminal PTYs to the dialog grid | The terminal dialog belongs to the intentionally removed dashboard popout surface. |
| `a29c48720` | `migrated` | Polish project and Run-on pickers in create-worktree dialog | Current create-worktree comboboxes use the migrated option grouping and add-project action. |
| `e8d5d50c3` | `equivalent` | Guide ripgrep installation after quick-open fallback exhaustion | `quick-open-install-rg-guidance.tsx` supplies the actionable fallback message. |
| `eb2508e7f` | `migrated` | Name the growing subsystem in renderer OOM reports | Bounded renderer memory profiles feed retained crash breadcrumbs and high-water diagnostics, with renderer/main-process coverage. |
| `5dc6799c4` | `equivalent` | Use LAN terminology consistently | Current Yiru Mobile and pairing copy uses LAN/private network terminology. |
| `84968dfd9` | `equivalent` | De-duplicate paired hosts in run-target pickers | Host option construction keys paired runtimes by stable execution-host identity. |
| `94d3db4a2` | `equivalent` | Show current branch without evicting Create Review | Source Control renders branch context and preserves the create-review primary action. |
| `babf1ff9e` | `migrated` | Keep Codex account mutations responsive during quota refresh | Add, select, reauthenticate, and remove start an independently caught best-effort quota refresh instead of awaiting it in the account mutation. |
| `4a09ede8b` | `migrated` | Classify Codex rate-limit windows by duration | RPC windows are classified and de-duplicated by `windowDurationMins`, with reordered, weekly-only, duplicate, and legacy-fallback coverage. |
| `ef985ed80` | `migrated` | Anchored Codex TUI settings promotion | `codex-config-mirror.ts` and path-aware config rewriting preserve managed settings. |
| `a34eb872c` | `equivalent` | Preserve PDF zoom across file reload | PDF viewer state retains zoom while refreshing document content. |
| `b97e8c4e2` | `migrated` | Resume finished agents after macOS logout | Completed Claude, Codex, Pi, and OMP turns retain host-aware provider-session anchors; quit/cold restore launches the provider resume path instead of a bare shell. |
| `34e0233cf` | `migrated` | Conversation names as primary agent-row labels | Shared extraction plus sidebar/dashboard row hooks and tests are present. |
| `52cef48fd` | `equivalent` | Render tab-close shortcut as text | Current shortcut labels use platform-aware text rather than key-cap UI. |
| `e3adb2091` | `migrated` | Include OMP terminals in cold session restore | Direct and Pi-wrapped OMP hooks report a session id; persistence plus desktop/Mobile resume support both that id and an exact transcript path. |
| `fde063618` | `equivalent` | Create paired agent sessions without stealing host focus | Runtime session creation is owner-scoped and does not require desktop host focus. |
| `eab721e1f` | `equivalent` | Route folder workspaces through worktree operations | Shared folder-workspace identity, runtime RPC, and Source Control adapters are present. |
| `9373f5d37` | `equivalent` | Expand Windows `~\\` in relay home resolution | Runtime home resolution is platform-aware and normalizes Windows paths. |
| `afa549f1d` | `equivalent` | Open New Merge Request on the GitLab fork project | Generic hosted-review creation preserves provider/fork project identity. |
| `933cee633` | `equivalent` | Open files into the focused browser pane | Editor/browser routing resolves the focused pane before choosing a new tab. |
| `65f245f07` | `equivalent` | Focus Explorer-opened Markdown for Find | Explorer open routing focuses the created editor/preview pane. |
| `c63ab965d` | `equivalent` | Open WSL terminal file links on Windows | Terminal file targets translate WSL paths before client-local opening. |
| `4c7bbed2f` | `equivalent` | Detect the Cursor Agent Node wrapper on Windows | Agent process recognition handles wrapper/child-process identity on Windows. |
| `91884b6d5` | `equivalent` | Drag project and group headers by their icon | Sidebar header drag handles include the icon target. |
| `bd45d705b` | `equivalent` | Open absolute local paths from the new-tab entry | New-tab file routing accepts absolute local paths and validates host ownership. |
| `c03e8f6f6` | `equivalent` | Advertise IPv6 addresses for Mobile pairing | Pairing address discovery supports IPv6 host addresses and URL-safe formatting. |

## Residual closure

The seven gaps initially identified by this audit were split by ownership and
migrated independently: sidebar preference/projections, create-review Git
workflow, Mobile Floating Workspace, remote updater, renderer memory
attribution, review-notes keybinding dispatch, and development tray identity.
The duplicate-Claude-account residual was migrated during the audit itself.

There are no remaining `still-missing` capability rows in this audited range.

## Reproduce and validate

```sh
# The audited endpoint and range must remain stable.
test "$(git rev-parse 817197fc3)" = 817197fc31b067fe93f734e6529c5440822bb568
test "$(git merge-base HEAD 817197fc3)" = 13c690b05aed1b4527ede3398d09ca7d697ebde7
test "$(git rev-list --no-merges --count 13c690b05..817197fc3)" = 412

# Candidate rows are one-commit-per-line and use only the four verdicts.
awk -F'|' '/^\| `[0-9a-f]{9}` / { gsub(/`| /, "", $3); print $3 }' \
  docs/reference/orca-upstream-feature-gap-audit.md \
  | sort -u \
  | diff -u - <(printf '%s\n' equivalent intentional-divergence migrated still-missing)

# No candidate commit may appear twice.
test -z "$(awk -F'`' '/^\| `[0-9a-f]{9}` / { print $2 }' \
  docs/reference/orca-upstream-feature-gap-audit.md \
  | sort \
  | uniq -d)"
```

This audit intentionally uses source/behavior evidence, not `git cherry`:
Yiru's rebrand and architecture changes mean patch identity cannot recognize an
independent equivalent implementation.
