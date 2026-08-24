# AGENTS.md

Yiru is an Electron desktop app — plus a native SwiftUI iOS companion — for running coding agents across many git worktrees, on local, WSL, SSH, and relay-connected hosts.

This file is the contract for every agent writing code here: structure, naming, cohesion, code quality. For visual work, the platform contract is canonical: [`apps/desktop/DESIGN.md`](./apps/desktop/DESIGN.md) for desktop and [`apps/mobile-ios/DESIGN.md`](./apps/mobile-ios/DESIGN.md) for mobile. [`docs/style-guide.md`](./docs/style-guide.md) is the detailed shared reference.

**The organizing principle.** Tailwind won because the style lives next to the markup: one place to look, one place to change. Apply that to all code. A feature's directory, filenames, and module boundaries exist so an agent can find the code from the feature name alone and change it without touching the rest of the tree. Optimize for *"where does this live?"* being answerable in one guess.

---

## Read first

These are hard rules regardless of who enforces them. Some still fail CI; several lost their
automated check when the repository-contract scripts that enforced them were deleted, and are
convention plus review only until a replacement check exists. The table says which is which — do
not treat "no automated check" as "not a rule." No exceptions inside a feature task.

| Never | Enforced by |
| --- | --- |
| Write or retain any test. No test files or test suites are allowed. | Section 9 |
| Add an `eslint-disable`/`oxlint-disable max-lines`, or a new entry to `apps/desktop/config/max-lines-baseline.txt` | Convention only — no automated check (the script that enforced this was deleted) |
| Add a project-owned `.d.ts` under `apps/desktop/src/preload` or `packages/shared/src` | PR workflow guard (`.github/workflows/pr.yml`) |
| Add a variable to the `@theme inline` block in `packages/client/src/assets/main.css` | Convention only — no automated check (the script that enforced this was deleted) |
| Use a native `<button>`/`<input>`/`<textarea>`/`<select>` in client feature TSX; write `rounded-*`; use `bg-black/N`-style alpha washes; import `components/ui/*-styles.ts` from feature code | Convention only — no automated check (the script that enforced this was deleted) |
| Use `interface`, `enum`, `namespace`, or `any` | oxlint + `erasableSyntaxOnly` |
| Ship a user-visible string that isn't wrapped in `t()` / `translate()` | Convention only — no automated check (the script that enforced this was deleted) |
| Hardcode `e.metaKey`, a path separator, or a platform font | Section 7 |
| Import desktop main/preload modules from `packages/client/src`, or use `~renderer` from desktop source | Section 1 |
| Name a file or folder `helpers`, `utils`, `common`, `misc`, or `shared-stuff`; add an `index.ts` re-export barrel | Section 2 |
| Rename or move a file without updating the paths written as *strings* — build scripts, CI jobs, baselines, allowlists, `Why:` comments | Convention only — no automated check (the script that enforced this was deleted) |
| Follow an absolute path from a subagent result into the main repo instead of this worktree | Section 12 |

---

## 1. Structure: a feature is a folder

```
apps/desktop/src/
  main/       Electron main: OS, git, PTY, agent providers, IPC handlers
  preload/    audited loopback bootstrap plus the native file-drop event adapter
  relay/      headless runtime server (local, SSH, and remote hosts dispatch through it)
  cli/        the `yiru` CLI
  types/      desktop build and runtime ambient declarations
apps/mobile-ios/
              native SwiftUI iOS app: YiruMobile/ = app source, YiruWidgets/ = widgets
apps/web/     landing site and product web entrypoints
packages/
  client/     source-only workbench UI consumed by desktop and web hosts
  shared/     cross-process pure logic, types, and the bootstrap contract
  workbench-model/, runtime-protocol/, mobile-relay-protocol/
              cross-client domain and transport contracts
skills/       agent skill packages shipped to end users, one folder per skill
scripts/      workspace-level tooling: contracts that span apps, skill generators
```

**Scripts live at the level they serve.** `scripts/` holds only tooling whose
inputs cross app boundaries — the source-path and max-lines contracts, the skill
generators — and the root `package.json` owns their npm scripts. Everything
scoped to one app lives in that app's own `apps/<app>/scripts/`, invoked from
that app's `package.json`. A script that reaches outside its app is in the wrong
folder; `config/` is for configuration, never executables.

`skills/<name>/SKILL.md` is product content, not app source — it sits at the
repository root because it is shipped to users' agent installs rather than built
into any one client. It is the **source of truth** for
`apps/desktop/src/cli/bundled-skill-guides.ts` and `apps/desktop/resources/skills/*.json`.
Both used to be regenerated from `SKILL.md` by `scripts/generate-bundled-skill-guides.mjs` and
`scripts/generate-skill-bundle-manifest.mjs`; both generators were deleted, so the two files are
now frozen snapshots that no script keeps in sync. Edit `SKILL.md` as the source of truth, and
hand-update `bundled-skill-guides.ts` and the manifest JSON to match in the same change.

**Import direction is one-way.** `packages/client` never imports desktop `main` or `preload`.
`packages/shared` never imports desktop, client, or `electron` modules — Node built-ins are fine.
`relay` and `cli` may reuse `main` modules. The preload contextBridge exposes only the loopback
endpoint and process token defined in `packages/shared/src/preload/`; it exposes no product
capability. Its sole platform event adapter resolves native OS `File` objects with Electron
`webUtils.getPathForFile`, then sends one validated file-drop payload for main to publish on the
shell event stream. It exposes no callable renderer API and is not a general transport. After the
bootstrap, renderer-to-host capability traffic has one transport: authenticated oRPC over
WebSocket. Use `shell.*` for capabilities owned by the local Electron shell or browser process, and
the runtime contract for capabilities executed by the local or selected runtime host. Web supplies
its runtime connection explicitly and never emulates an Electron preload API. Pure types or logic
used by more than one desktop process belong in `packages/shared`, even when no other app consumes
them.

`@yiru/client` is independently consumable source. Hosts import only its declared package exports;
they never reach into `packages/client/src`. Its `@yiru/client/vite` preset owns source resolution,
React/Tailwind plugins, and client aliases, while the package owns its own typecheck, lint, and i18n
generation. Changing client implementation must not require a desktop edit unless the runtime
protocol or the bootstrap handshake itself changes.

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

Past ~15 files, a feature folder has sub-features inside it — nest them (`source-control/commit/`, `source-control/diff/`). A folder's entry point is named for the folder's job (`panel.tsx`, `pane.tsx`, `page.tsx`), never `index.tsx`: barrels hide the dependency graph and defeat tree-shaking.

### The touch budget

**A typical feature change should touch 1–3 files in one folder.** If a small behavior change needs a dozen edits, that's a structural defect — the feature is smeared across the tree, or you're editing the wrong layer.

Crossing the process boundary is the one legitimate multi-file change. Keep a runtime capability to
three touchpoints sharing one feature name: the contract in `packages/runtime-protocol/src/`, the
handler in `apps/desktop/src/main/runtime/`, and the caller in `packages/client/src/`. A local
shell capability uses the same three-point shape under the `shell.*` contract. The preload is not a
capability layer; touch it only for the loopback bootstrap or an Electron-only platform event that
cannot be observed with the same information in the isolated renderer.

---

## 2. Naming

Filenames are lowercase kebab-case, always. Beyond that, files and symbols follow the same rules:

- **Name the thing, not the role.** `tab-group-state.ts`, `terminal-orphan-cleanup.ts` — not `tabs-helpers.ts`, `terminal-utils.ts`. Reaching for `helpers` means the file has more than one responsibility, or a better name is hiding in what the code operates on.
- **Don't repeat the folder.** In `source-control/` the file is `panel.tsx`, not `source-control-panel.tsx`. Prefix-stuttering makes every listing unscannable.
- **Short and concrete** — two or three words. If you need five, it's doing five things.
- **Domain over mechanism:** `resolveWorktreeBaseRef`, not `processData`. Booleans read as assertions (`isGitBashAvailable`, `hasUncommittedChanges`). Don't encode the type in the name (`worktreeList`, not `worktreeArray`) or abbreviate past recognition (`repo` is established here; `wt` isn't).
- `PascalCase` types and components, `camelCase` values, `SCREAMING_SNAKE` module constants with a unit suffix where there is one (`KEYBOARD_INPUT_SOURCE_TIMEOUT_MS`). Props types are `<Component>Props`.
- Keep meaningful role suffixes (`.config.ts`). Exempt: tool-discovery names, generated artifacts, native-language conventions.

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
- Type declarations go in `.ts`. Under `apps/desktop/src/preload` and `packages/shared/src` this is a CI gate: `skipLibCheck: true` silently widens unresolved names in a `.d.ts` to `any`, which is how a broken IPC signature once shipped past typecheck.
- Prefer `satisfies` over `as`. An `as` cast is a claim the type system can't back — if you need one, say why.
- **Imports use an alias the moment they leave the folder they belong to.** `~renderer/*` means
  `packages/client/src/*`; it is package-internal and supplied to hosts by the
  `@yiru/client/vite` preset. `~shared/*` means `packages/shared/src/*`. `~main/*` and
  `~preload/*` are desktop-only. Inside one area, `./x` and `../x`
  stay relative — reach for the alias at two levels up or more. `relay/` and `cli/` are leaf
  executables nothing imports into, so they have no aliases, and desktop has no bare `~`.
- `packages/shared/src` uses only relative imports internally; aliases there would make the package
  depend on a host resolver. Desktop source cannot use `~renderer`; it consumes public
  `@yiru/client` exports. Client source cannot use `~main` or `~preload`. These are architectural
  rules, not style preferences — the script that used to fail the build on a violation
  (`check-import-path-policy.mjs`) was deleted, so nothing currently checks this automatically.
- `build:cli` is a plain `tsc` emit, so it cannot resolve aliases at runtime: `scripts/rewrite-emitted-aliases.mjs` turns them back into relative requires and fails the build on any it does not recognize. Adding a desktop alias means updating that script and `config/tsconfig.cli.json` together.

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
- Route filesystem, git, terminal, and search operations through the runtime clients
  (`packages/client/src/runtime/*-client.ts`, `apps/desktop/src/main/runtime/`) instead of calling
  Node from a feature.
- Scope cached host state — capabilities, versions, connection health — to the host that executes it. One host's answer must never leak into another's.
- Keyboard shortcuts branch on platform: `navigator.userAgent.includes('Mac')` → `metaKey`, else `ctrlKey`. Electron menu accelerators use `CmdOrCtrl`.

---

## 8. Git

Yiru shells out to **the user's** git binary, whose version differs across native, WSL, and SSH hosts. **Git 2.25** is the core-workflow baseline.

- Check when every subcommand and option was introduced. Newer behavior needs a baseline-compatible fallback, or must degrade safely.
- Route the preferred/fallback pair through `GitCapabilityCache`
  (`packages/shared/src/git/capability-cache.ts`) with a narrow unsupported-error predicate, so a
  known-invalid command isn't retried on every poll. `git --version` isn't sufficient, and
  `simple-git` doesn't paper over host differences.
- Preserve global options that precede the subcommand (`git -c …`), including auto-maintenance suppression on worktree-create fetches.
- PR CI verifies compatibility against real git 2.25.5, 2.38.1, and 2.54.0. Adopting a newer feature means adding its version boundary to the compatibility check so both paths get exercised.

GitHub, GitLab, Bitbucket, Gitea, and Azure DevOps are all supported: keep provider-specific behavior behind explicit checks, and don't give a generic source-control concept a GitHub-only name. The user's `gh` rate limit is a shared resource — batch requests and skip calls you don't need.

---

## 9. No tests

**Do not write any tests. Do not retain any tests.**

Delete existing unit, integration, snapshot, and end-to-end tests instead of repairing, updating, or expanding them. The repository must contain no test files or test suites, and CI must not run tests. Verify behavior through builds, typechecking, linting, repository-contract checks, and running the app.

---

## 10. Verify before you finish

`pnpm check` is the gate — `vp lint --fix`, then typecheck, then `verify:repository-contracts`. That
task now checks switch exhaustiveness only: the design-token budget, UI style drift, source path
references, max-lines ratchet, skill guides/manifest, and localization catalog/coverage checks it
used to run were all deleted along with their scripts, and nothing has replaced them — those rules
still apply (see "Read first") but are enforced by review, not by this command. `pnpm typecheck`,
`pnpm lint`, and `pnpm fmt` run the remaining pieces individually.

**Reach into a package with `vp run <package>#<task>`**, from anywhere in the repo — `vp run yiru#build:mac`, `vp run yiru-mobile-ios#dev`. The root `package.json` no longer keeps a forwarding script per package task; it holds only what the whole workspace shares. Inside a package, one script calls another with `vp run <task>`, never `pnpm run <task>`, so the task graph stays visible to the runner.

A script that needs its workspace dependencies built first says so itself, with `vp run --filter '{.}^...' build` — the filter resolves this package's own dependencies from the workspace graph, so no caller has to remember the order and no package list gets hardcoded. Keep such work in `package.json`: a task defined in `vite.config.ts` is unreachable from `pnpm run`, which strands every call site that isn't already inside Vite+.

That graph is built from `workspace:*` dependencies only. A workspace package pulled in through `catalog:` is invisible to it — the filter silently selects nothing and the ordering disappears — so cross-package deps here are always declared `workspace:*`.

Report results honestly: if something fails, show the output; if you skipped a step, say which.

---

## 11. Working in legacy areas

Much of this repo predates these rules — hundreds of loose modules in `packages/shared/src` and
`packages/client/src/lib`, flat feature folders, stuttering filenames, feature CSS in
`packages/client/src/assets/main.css`, and a `max-lines` grandfather list. That is the state to move
away from, not a precedent to copy.

- **New code follows this document**, without exception.
- **When you touch a legacy area, move what you touch toward it**: pull the files you're already editing into the feature folder, drop the redundant prefixes. Don't launch an unrequested refactor beyond that.
- Never resolve a conflict between this document and surrounding code by matching the surrounding code.

---

## 12. Environment

Always read and edit through the primary working directory — this worktree. Never follow an absolute path from a subagent's result into the main repo; edits there are invisible here.
