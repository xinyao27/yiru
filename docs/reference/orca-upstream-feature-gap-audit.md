# Orca recent feature gap audit

Audit date: 2026-07-24. Compared Yiru `3d3ed4cc6` plus the current working tree with Orca `817197fc3`; their merge base is `13c690b05`.

## Conclusion

Yes: besides the cross-agent continuation work from [Orca #9170](https://github.com/stablyai/orca/commit/44f77a3b7d99fa91cbd9587f28a759f9f4f3c874), several recent user-visible Orca features are not in Yiru. This is not the same as saying that every upstream-only commit is a missing feature: the range contains 411 non-merge commits, only 36 of which are labelled `feat`, and it also contains fixes, performance work, releases, reverts, and work for products Yiru deliberately removed.

## Confirmed missing: highest-impact six

| Feature | Upstream evidence | Yiru evidence | Confidence |
| --- | --- | --- | --- |
| Mobile Quick Commands, including terminal commands and agent-prompt presets | [Orca `5fcf77761`](https://github.com/stablyai/orca/commit/5fcf77761) adds the mobile command list, editor, sheet, launch path, and RPC support. | Yiru has the desktop implementation under [`terminal-quick-commands`](../../apps/desktop/src/renderer/src/components/terminal-quick-commands), but no corresponding Quick Commands modules under `apps/mobile`; the mobile tab action model currently only composes existing actions in [`mobile-terminal-action-sheet-actions.ts`](../../apps/mobile/src/session/mobile-terminal-action-sheet-actions.ts). | High |
| One consolidated agent-usage roster popover in the status bar | [Orca `580f8eb49`](https://github.com/stablyai/orca/commit/580f8eb49) adds `UsageRosterPanel` and replaces the separate provider presentation. | Yiru still renders separate Claude, Codex, and provider usage segments in [`status-bar.tsx`](../../apps/desktop/src/renderer/src/components/status-bar/status-bar.tsx); there is no roster panel/model. | High |
| Download an entire folder from the SSH remote explorer | [Orca `8ed8f0d10`](https://github.com/stablyai/orca/commit/8ed8f0d10) adds the folder-transfer IPC, SFTP recursion, safe local promotion, and explorer action. | Yiru's [`ssh-filesystem-provider.ts`](../../apps/desktop/src/main/providers/ssh-filesystem-provider.ts) and preload API expose `downloadFile`, but not `downloadFolder`. | High |
| Open an SSH workspace in VS Code through Remote-SSH | [Orca `adc020393`](https://github.com/stablyai/orca/commit/adc020393) adds SSH-authority resolution and a connection-aware external-editor launch contract. | Yiru declares the future capability name in [`runtime-capability-contract.ts`](../../packages/runtime-protocol/src/runtime-capability-contract.ts), but [`api-types.ts`](../../apps/desktop/src/preload/api-types.ts) and [`shell.ts`](../../apps/desktop/src/main/ipc/shell.ts) still expose the local-path-only editor launch; there is no VS Code SSH-authority resolver. | High |
| Surface nested Codex subagents in agent rows | [Orca `e986a7ba1`](https://github.com/stablyai/orca/commit/e986a7ba1) adds Codex hook identity/roster reconciliation and projects the children into sidebar/dashboard rows. | Yiru's current roster path is explicitly Claude-specific (`claudeSubagentRosterByPaneKey`) in [`agent-hook-listener.ts`](../../apps/desktop/src/shared/agent-hook-listener.ts), with no Codex roster module or Codex nested-agent hook handling. | High |
| Use generated conversation names as the primary label for sidebar/dashboard agent rows | [Orca `34e0233cf`](https://github.com/stablyai/orca/commit/34e0233cf) adds shared conversation-name extraction and row hooks. | Yiru's [`worktree-card-compact-agent-row.tsx`](../../apps/desktop/src/renderer/src/components/sidebar/worktree-card-compact-agent-row.tsx) and [`dashboard-agent-row.tsx`](../../apps/desktop/src/renderer/src/components/dashboard/dashboard-agent-row.tsx) still choose the latest prompt/state label directly; no `agent-row-conversation-name` module exists. | High |

Other clearly absent but smaller UI deltas include selected-text seeding for editor Find ([`034aeb15e`](https://github.com/stablyai/orca/commit/034aeb15e)), the question glyph for “Needs You” ([`b63d4cde2`](https://github.com/stablyai/orca/commit/b63d4cde2)), an independent editor-font preference ([`91ee29a80`](https://github.com/stablyai/orca/commit/91ee29a80)), and always offering “Add a new project” in the worktree picker ([`ed28dec59`](https://github.com/stablyai/orca/commit/ed28dec59)).

## Already present or substantially equivalent

- The cross-agent continuation implementation corresponding to [Orca #9170](https://github.com/stablyai/orca/commit/44f77a3b7d99fa91cbd9587f28a759f9f4f3c874) landed in Yiru as `3d3ed4cc6`, under [`agent-session-continuation`](../../apps/desktop/src/renderer/src/components/agent-session-continuation) and [`launch-agent-session-continuation.ts`](../../apps/desktop/src/renderer/src/lib/launch-agent-session-continuation.ts).
- Desktop Quick Commands already exist in Yiru, including settings, tab-bar dispatch, and terminal menus. The confirmed gap above is specifically Orca's later **mobile** expansion, not the whole feature.
- Yiru already renders pinned worktrees in their natural groups as well as the pinned section in [`worktree-list.tsx`](../../apps/desktop/src/renderer/src/components/sidebar/worktree-list.tsx). Orca's [later commit](https://github.com/stablyai/orca/commit/c5d2275c3) mainly makes that behavior configurable; the visible “show” behavior is therefore not wholly missing.

## Intentional product divergence, not migration debt

Yiru explicitly removed the workspace-board/task products in [`5f10a03ba`](https://github.com/xinyao27/yiru/commit/5f10a03ba) and the remaining Linear/Jira integration in [`e0a9f4e3d`](https://github.com/xinyao27/yiru/commit/e0a9f4e3d). Consequently, recent Orca Linear, Jira, Tasks, and workspace-board commits should not be counted as missing Yiru features unless those product decisions are reversed. This includes Orca's Linear issue save/list/relation/history series and later workspace-board/task fixes.

The Orca agent-dashboard popout ([`3468b434d`](https://github.com/stablyai/orca/commit/3468b434d)) also sits on the removed dashboard/workspace-board product surface, so it is better treated as a product decision rather than an automatic backport candidate.

## Needs a deeper subsystem audit

- Codex multi-account real-home routing ([`e58de71f5`](https://github.com/stablyai/orca/commit/e58de71f5)) and its follow-up fixes: Yiru has its own substantial `codex-accounts` implementation, so commit-title comparison cannot establish parity.
- Host-aware Native Chat skill discovery ([`1def694e8`](https://github.com/stablyai/orca/commit/1def694e8)): Yiru has a skill picker and a runtime-aware discovery contract, but the current hook is Codex-only and supplies only `cwd`; WSL, SSH, and Claude-plugin parity needs behavioral testing.
- Pi session resume ([`3f335efdb`](https://github.com/stablyai/orca/commit/3f335efdb)): Yiru has Pi/OMP extensions and general hibernation/resume infrastructure, but no direct source match for Orca's persisted Pi session metadata path.
- The hundreds of terminal, relay, mobile, Git, and performance fixes after the merge base. These must be audited by subsystem and observed behavior; “upstream-only commit” is not proof that the bug still exists in Yiru.

## Reproducible scope checks

```sh
git rev-parse FETCH_HEAD
git merge-base HEAD FETCH_HEAD
git log --no-merges --oneline 13c690b05..FETCH_HEAD
git log --no-merges --oneline 13c690b05..HEAD
git cherry HEAD FETCH_HEAD
```

At the audit point, `git cherry HEAD FETCH_HEAD` found no patch-equivalent upstream commits. That is useful for detecting literal cherry-picks, but it does not detect independently implemented equivalent behavior, renamed modules, or intentional divergence; the classifications above therefore use source-level evidence as well.
