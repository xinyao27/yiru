# AGENTS.md

Yiru is an Electron desktop app — plus an Expo mobile companion — for running coding agents across many git worktrees, on local, WSL, SSH, and relay-connected hosts.

This file is the contract for every agent writing code here: structure, naming, cohesion, code quality. For anything visual, [docs/style-guide.md](./docs/style-guide.md) is canonical and this file defers to it.

**The organizing principle.** Tailwind won because the style lives next to the markup: one place to look, one place to change. Apply that to all code. A feature's directory, filenames, and module boundaries exist so an agent can find the code from the feature name alone and change it without touching the rest of the tree. Optimize for *"where does this live?"* being answerable in one guess.

---

## Read first

These fail CI or are outright forbidden. No exceptions inside a feature task.

| Never | Enforced by |
| --- | --- |
| Write a test. Any test. | Section 9 |
| Add an `eslint-disable`/`oxlint-disable max-lines`, or a per-file `max-lines` bump in `apps/mobile/config/mobile-max-lines-ratchets.ts` | `check-max-lines-ratchet.mjs` |
| Add a project-owned `.d.ts` under `src/preload` or `src/shared` | PR workflow guard |
| Add a variable to the `@theme inline` block in `main.css` | `check-design-token-budget.mjs` |
| Use a native `<button>`/`<input>`/`<textarea>`/`<select>` in renderer feature TSX; write `rounded-*`; use `bg-black/N`-style alpha washes; import `components/ui/*-styles.ts` from feature code | `check-ui-style-drift.mjs` |
| Use `interface`, `enum`, `namespace`, or `any` | oxlint + `erasableSyntaxOnly` |
| Ship a user-visible string that isn't wrapped in `t()` / `translate()` | `audit-localization-coverage.mjs` |
| Hardcode `e.metaKey`, a path separator, or a platform font | Section 7 |
| Import from `src/main/` in `src/renderer/` | Section 1 |
| Name a file or folder `helpers`, `utils`, `common`, `misc`, or `shared-stuff`; add an `index.ts` re-export barrel | Section 2 |
| Rename or move a file without updating the paths written as *strings* — build scripts, CI jobs, baselines, allowlists, `Why:` comments | `check-source-path-references.mjs` |
| Follow an absolute path from a subagent result into the main repo instead of this worktree | Section 12 |

---

## 1. Structure: a feature is a folder

```
apps/desktop/src/
  shared/     pure logic + types used by more than one process
  main/       Electron main: OS, git, PTY, agent providers, IPC handlers
  preload/    the audited contextBridge contract (index.ts + api-types.ts)
  renderer/   React UI
  relay/      headless runtime server (local, SSH, and remote hosts dispatch through it)
  cli/        the `yiru` CLI
apps/mobile/  Expo app: app/ = routes, src/ = features
packages/     cross-client contracts: workbench-model, runtime-protocol,
              mobile-relay-protocol, expo-two-way-audio
```

**Import direction is one-way.** `renderer` never imports `main`. `shared` never imports `main`, `renderer`, or `electron` — Node built-ins are fine. `relay` and `cli` may reuse `main` modules. The renderer reaches the main process only through the preload contract. A type used only inside `apps/desktop` belongs in `src/shared/`, not in a package.

### Where a new file goes

Stop at the first yes:

1. **An existing feature owns this** → its folder. Not beside it, not in a sibling dump.
2. **It's a new feature** → create `<feature>/` in the right process root and put everything in it.
3. **It's genuinely cross-feature** → one level up, named for what it operates on (`capability-cache.ts`, `map-with-concurrency.ts`), never for a role.

A feature folder holds everything that belongs only to that feature — components, hooks, state, pure logic, constants, types, CSS — not split across `components/`, `hooks/`, `lib/`, and `store/` by technical role.

```
✓  components/source-control/           ✗  components/source-control-panel.tsx
     panel.tsx                              hooks/use-source-control-state.ts
     commit-form.tsx                        lib/source-control-diff.ts
     diff-list.tsx                          lib/source-control-staging.ts
     staging.ts                             store/slices/source-control.ts
     state.ts
```

Role-named folders (`hooks/`, `lib/`, `store/`) are for things used by three or more unrelated features.

Past ~15 files, a feature folder has sub-features inside it — nest them (`native-chat/composer/`, `native-chat/transcript/`). A folder's entry point is named for the folder's job (`panel.tsx`, `pane.tsx`, `page.tsx`), never `index.tsx`: barrels hide the dependency graph and defeat tree-shaking.

### The touch budget

**A typical feature change should touch 1–3 files in one folder.** If a small behavior change needs a dozen edits, that's a structural defect — the feature is smeared across the tree, or you're editing the wrong layer.

Crossing the process boundary is the one legitimate multi-file change. Keep it to four touchpoints sharing one feature name: the contract in `shared/<feature>/` (or `packages/*` if mobile needs it), the handler in `main/<feature>/`, the preload bridge (`index.ts` + `api-types.ts`, two files by design), and the caller in `renderer/`. A fifth layer is indirection that doesn't earn its keep.

---

## 2. Naming

Filenames are lowercase kebab-case, always. Beyond that, files and symbols follow the same rules:

- **Name the thing, not the role.** `tab-group-state.ts`, `terminal-orphan-cleanup.ts` — not `tabs-helpers.ts`, `terminal-utils.ts`. Reaching for `helpers` means the file has more than one responsibility, or a better name is hiding in what the code operates on.
- **Don't repeat the folder.** In `native-chat/` the file is `composer.tsx`, not `native-chat-composer.tsx`. Prefix-stuttering makes every listing unscannable.
- **Short and concrete** — two or three words. If you need five, it's doing five things.
- **Domain over mechanism:** `resolveWorktreeBaseRef`, not `processData`. Booleans read as assertions (`isGitBashAvailable`, `hasUncommittedChanges`). Don't encode the type in the name (`worktreeList`, not `worktreeArray`) or abbreviate past recognition (`repo` is established here; `wt` isn't).
- `PascalCase` types and components, `camelCase` values, `SCREAMING_SNAKE` module constants with a unit suffix where there is one (`KEYBOARD_INPUT_SOURCE_TIMEOUT_MS`). Props types are `<Component>Props`.
- Keep meaningful role suffixes (`.config.ts`). Exempt: tool-discovery names, framework route parameters (Expo's `[id].tsx`), generated artifacts, native-language conventions.

---

## 3. Cohesion: keep logic where it is used

Splitting is good; scattering is not. The difference is whether the pieces stay together.

- **Colocate first.** A helper used by one component lives in that component's file until it has a second caller. A separate file per function is how you get 400 loose modules and a feature nobody can read.
- **Split along seams, not line counts.** Extract when a unit has its own reason to change — a parser, a protocol frame, a capability probe, a pure reducer. Don't extract because a file got long; restructure so it doesn't need to be.
- **Hard limits** (counted lines, blanks and comments excluded): 300 `.ts`, 400 `.tsx`, 600 `.mjs`. Hitting one means more than one responsibility. Split within the feature folder, never into a shared dump, and never suppress the rule.
- **Push logic out of components.** A component decides layout and wiring; branching rules, parsing, and normalization go to a pure sibling module in the same folder.
- **State lives at one altitude.** Store slice, feature module, or component — one owner writes, the rest read.

---

## 4. TypeScript

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` are all on.

- No parameter properties; model closed sets as a union of string literals plus a plain object.
- Use `unknown` at boundaries and narrow. Rest args are the only `any` exemption.
- `import type { … }` for type-only imports.
- `switch` over a union is exhaustive with no `default` — adding a union member should break every switch that handles it.
- Type declarations go in `.ts`. Under `src/preload` and `src/shared` this is a CI gate: `skipLibCheck: true` silently widens unresolved names in a `.d.ts` to `any`, which is how a broken IPC signature once shipped past typecheck.
- Prefer `satisfies` over `as`. An `as` cast is a claim the type system can't back — if you need one, say why.
- Path aliases `@/*` and `@renderer/*` map to the renderer root; use them there. Cross-process imports stay relative.

---

## 5. React and the renderer

- `export function Component(props: ComponentProps): React.JSX.Element`. Named exports; a default export only where `React.lazy` requires one.
- **Never derive state in an effect.** No `useState` + `useEffect` mirroring a prop or recomputing a value — compute during render, or `useMemo` when it's genuinely expensive. The `react-doctor` pass warns on `no-derived-state-effect`, `no-adjust-state-on-prop-change`, and `no-initialize-state`; treat those as errors.
- Effects synchronize with things outside React — subscriptions, IPC listeners, timers, imperative host libraries — and every one cleans up.
- Fix `react/exhaustive-deps` warnings; don't silence them.
- No inline object or array literals as context values or memo-sensitive props.
- Store access goes through selectors, so a component re-renders only on what it reads.
- Keys are stable identities, never array indices.

---

## 6. Formatting and comments

Formatting is not a decision — `vp fmt` owns it: single quotes, no semicolons, 100 columns, no trailing commas, sorted imports, sorted Tailwind classes. Don't hand-format around it.

**Comments explain why, never what.** A comment exists only when the reason isn't recoverable from the code — a safety constraint, a platform quirk, a compatibility shim, a deliberate rule. One or two lines; capture the reason and stop. Don't restate the mechanism, narrate control flow, or quote a document.

The house convention is the `Why:` prefix, which makes the load-bearing comments greppable — there are ~15,000 and they are this codebase's real documentation.

No `TODO` without an issue link. No commented-out code — git has it.

---

## 7. Hosts and platforms: never assume local

Work runs on the local machine, in a WSL distro, over SSH, and through a relay. Every path that touches a filesystem, a process, or a git binary must work on all of them, on macOS, Linux, and Windows alike — code, commands, and scripts.

- Resolve paths with `path.join` or Electron path utilities. Never assume `/` or `\`.
- Route filesystem, git, terminal, and search operations through the runtime clients (`renderer/src/runtime/runtime-*-client.ts`, `main/runtime/`) instead of calling Node from a feature.
- Scope cached host state — capabilities, versions, connection health — to the host that executes it. One host's answer must never leak into another's.
- Keyboard shortcuts branch on platform: `navigator.userAgent.includes('Mac')` → `metaKey`, else `ctrlKey`. Electron menu accelerators use `CmdOrCtrl`.

---

## 8. Git

Yiru shells out to **the user's** git binary, whose version differs across native, WSL, and SSH hosts. **Git 2.25** is the core-workflow baseline.

- Check when every subcommand and option was introduced. Newer behavior needs a baseline-compatible fallback, or must degrade safely.
- Route the preferred/fallback pair through `GitCapabilityCache` (`shared/git/capability-cache.ts`) with a narrow unsupported-error predicate, so a known-invalid command isn't retried on every poll. `git --version` isn't sufficient, and `simple-git` doesn't paper over host differences.
- Preserve global options that precede the subcommand (`git -c …`), including auto-maintenance suppression on worktree-create fetches.
- PR CI runs the compatibility test against real git 2.25.5, 2.38.1, and 2.54.0. Adopting a newer feature means adding its version boundary there so both paths get exercised.

GitHub, GitLab, Bitbucket, Gitea, and Azure DevOps are all supported: keep provider-specific behavior behind explicit checks, and don't give a generic source-control concept a GitHub-only name. The user's `gh` rate limit is a shared resource — batch requests and skip calls you don't need.

---

## 9. Do not write tests

**Do not author unit tests, integration tests, or any other tests** — not proactively, not for safety, not as a bonus alongside a fix. Agent-written tests are unreviewed by definition here: they lock in whatever the agent assumed, slow every later change, and cost tokens without buying confidence. If a change seems risky enough to need one, say so in your summary and move on.

Existing tests stay — don't bulk-delete them. If your change breaks one, fix the code when the test caught a real bug, or update that single test minimally when the behavior legitimately changed. Never add a test file, and never grow one with new cases.

Verify by building, typechecking, linting, and running the app.

---

## 10. Verify before you finish

`pnpm check` is the gate — `vp lint --fix`, then typecheck, then `verify:repository-contracts` (switch exhaustiveness, design-token budget, UI style drift, source path references, max-lines ratchet, skill guides and manifest, localization catalog and coverage). `pnpm typecheck`, `pnpm lint`, and `pnpm fmt` run the pieces individually.

Report results honestly: if something fails, show the output; if you skipped a step, say which.

---

## 11. Working in legacy areas

Much of this repo predates these rules — hundreds of loose modules in `shared/` and `renderer/src/lib/`, flat feature folders, stuttering filenames, feature CSS in `main.css`, and a `max-lines` grandfather list. That is the state to move away from, not a precedent to copy.

- **New code follows this document**, without exception.
- **When you touch a legacy area, move what you touch toward it**: pull the files you're already editing into the feature folder, drop the redundant prefixes. Don't launch an unrequested refactor beyond that.
- Never resolve a conflict between this document and surrounding code by matching the surrounding code.

---

## 12. Environment

Always read and edit through the primary working directory — this worktree. Never follow an absolute path from a subagent's result into the main repo; edits there are invisible here.
