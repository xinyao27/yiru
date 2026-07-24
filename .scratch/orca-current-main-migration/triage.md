# Orca `817197fc3..1bd36ce04` product triage

This ledger classifies every one of the 49 non-merge commits exactly once. “Must” means session,
data, permission, crash, input, process, packaging, or execution-host correctness. “Later” means a
real but recoverable UX/compatibility defect. “Verify” means Yiru already has the user-visible
contract. “Do not migrate” means non-product work or no valid Yiru product surface.

| Commit | Decision | Reason |
| --- | --- | --- |
| `92696558c` | Must | A disconnected SSH placeholder must not dispatch import/clone work. |
| `877bbdebf` | Must | A live Pi session must not fork into a duplicate agent tab. |
| `108a2ad41` | Later | Absolute CLI file paths are useful compatibility; relative paths still work. |
| `fa09d6fd8` | Do not migrate | Tasks is a removed Yiru surface. |
| `34caad787` | Later | The Browser guest can leave the tab switcher stuck, but the failure is recoverable. |
| `4274dbc48` | Do not migrate | Linear is a removed Yiru surface. |
| `2cf41ab86` | Later | Mobile's inactive terminal caret is a visibility-only issue. |
| `efe996a00` | Do not migrate | Orca release-cut CI only. |
| `cda97cec4` | Do not migrate | README asset only. |
| `c1d2c4be0` | Must | PowerShell profiles can move the terminal away from the requested worktree. |
| `6d39e4948` | Do not migrate | GitHub's restricted shell is not a Yiru execution host and cannot run relay/filesystem commands. |
| `2cbcf03b0` | Must | Unqualified SSH fallback paths can collide across repositories. |
| `739fce528` | Must | Remote Codex startup state is currently dropped during hydration races. |
| `4e670d3e4` | Later | A narrow TUI mouse-mode transition can replay one stale wheel event. |
| `deb2b50e7` | Later | Setup-hook prompts can stay stale until the user re-enters the view. |
| `9ced27eca` | Later | Missing macOS Computer Use helper should degrade gracefully in onboarding. |
| `eefded2a0` | Must | Linux middle-click can paste twice into a real terminal command line. |
| `253ccd29f` | Must | Project removal leaves workspace-session state that can resurrect ghost workspaces. |
| `48a258d50` | Must | The Windows artifact currently packages a duplicate broken CLI shim. |
| `dd642cb3e` | Later | Claude usage can stay stale until the next refresh after the last PTY exits. |
| `d8499fae1` | Must | A stale sort projection can mint authoritative worktree metadata. |
| `c2371c0cd` | Must | Headless Mobile can hydrate a session for a deleted repository. |
| `143d2232b` | Must | Hydration can retain an active worktree id that no longer exists. |
| `cd28da13f` | Must | `orchestration.ask` otherwise dies at the 30-second idle wall. |
| `53222cc9c` | Must | Codex account restart can lose its command before the shell is ready. |
| `5a1ca2426` | Verify | Product Web adapters and initial store state already normalize every provider key. |
| `26e48e415` | Must | Windows SSH relay must respect the configured OpenSSH login shell. |
| `cb19e7950` | Must | Claude resume from the latest cwd can fail; it needs the transcript start cwd. |
| `a90ec540f` | Must | IME blur/unmount can drop the user's final visible syllable. |
| `b5ae776c3` | Later | Clearing terminal search can leave a stale active highlight. |
| `1ace87c15` | Must | Global `gh`/`glab` fallback can run in the wrong WSL distro. |
| `a4f42ad42` | Must | Terminal paste fails on the supported plain-HTTP Web client. |
| `e3cc08f18` | Later | Disabled sparse checkout can remain falsely displayed as active. |
| `fc181a849` | Later | CJK theme counts need a separator; real but presentation-only. |
| `1f29a33b2` | Later | An unmounted virtual header can temporarily cover the host card. |
| `dc18ba9cd` | Must | Stopping a Windows agent can leave descendant/MCP processes holding the worktree. |
| `6997bc40a` | Must | Undefined usage state can crash the supported HTTP Web settings surface. |
| `69d05b6e2` | Must | Mobile startup currently bypasses host-owned permission/default argument policy. |
| `559f04d29` | Must | Daemon startup applies its cwd safety gate before resolving the safe fallback. |
| `1b5db4bc2` | Later | macOS occlusion reveal can clip the bottom bar until another resize. |
| `ec04827b3` | Do not migrate | Test-only commit; reuse the scenario only when testing the related session change. |
| `eea1577dd` | Later | A close/exit race can leave a stale retained-agent row, not a live process. |
| `662d23f9b` | Do not migrate | README link only. |
| `d1ccfcff4` | Must | Invalid branch prefixes currently reach Git and can block worktree creation. |
| `d50ea090c` | Must | Markdown line links need source mode and owner-qualified file identity to avoid wrong-host reveal. |
| `e651fe91c` | Must | Ambiguous Mobile image delivery can leak the image path into the next message. |
| `981653f27` | Do not migrate | Removes Orca OpenSpec documents only. |
| `1367094bb` | Verify | Yiru already anchors the tooltip at `bottom: 0; left: 0`; Orca only refines CSS corners/borders. |
| `1bd36ce04` | Do not migrate | Yiru has no Orca-style PR-files combined-diff consumer to reorder. |

## Totals

- Must migrate: 25
- Should migrate later: 13
- Equivalent, verify only: 2
- Do not migrate: 9
