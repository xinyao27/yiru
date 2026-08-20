# Contributing to Yiru

Thanks for contributing to Yiru.

## Before You Start

- Keep changes scoped to a clear user-facing improvement, bug fix, or refactor.
- Yiru targets macOS, Linux, and Windows. Every change must stay compatible with all three platforms unless the code is explicitly guarded by a runtime platform check.
- For keyboard shortcuts, use runtime platform checks in renderer code and `CmdOrCtrl` in Electron menu accelerators.
- For shortcut labels, show `⌘` and `⇧` on macOS, and `Ctrl+` and `Shift+` on Linux and Windows.
- For file paths, use Node or Electron path utilities such as `path.join`.
- Yiru must work against local repositories, remote servers, and SSH worktrees. Do not assume a process, file, credential, shell, or network path exists only on the local machine.
- Yiru supports many CLI agents, integrations, and git providers. Keep generic behavior provider-neutral; guard integration-specific logic behind explicit checks.
- Keep changes well-engineered and performant: follow existing architecture, avoid unnecessary work in hot paths, clean up owned resources, and use concrete module names.
- For UI work, follow [`docs/STYLEGUIDE.md`](../docs/STYLEGUIDE.md), use the tokens and shadcn primitives it specifies, and verify polished behavior across platforms, light/dark mode, and SSH latency.

## Local Setup

```bash
pnpm install
pnpm dev
```

## Branch Naming

Use a clear, descriptive branch name that reflects the change.

Good examples:

- `fix/ctrl-backspace-delete-word`
- `feat/shift-enter-newline`
- `chore/update-contributor-guide`

Avoid vague names like `test`, `misc`, or `changes`.

## Before Opening a PR

Run the same checks that CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

If your change affects UI or interaction behavior, verify it manually on the platforms it could impact.

## Type Declarations: Prefer `.ts` Over `.d.ts`

Project-owned type declarations belong in `.ts` files. `.d.ts` is reserved for ambient shims (e.g., `env.d.ts`, `vite/client.d.ts`). TypeScript's `skipLibCheck: true` setting applies globally, including to our own `.d.ts` files, which means any unresolved type reference in a `.d.ts` silently becomes `any` at its call sites. Write your types in `.ts` files so the compiler actually checks them.

CI enforces this for `apps/desktop/src/preload/` and `packages/shared/src/` — see `docs/preload-typecheck-hole.md`.

## Pull Requests

Each pull request should:

- explain the user-visible change
- stay focused on a single topic when possible
- include screenshots or screen recordings for new UI or behavior changes
- include high-quality tests when behavior changes or bug fixes warrant them
- include a brief code review summary from your AI coding agent that explicitly checks cross-platform compatibility, SSH/remote/local compatibility, supported agent and integration compatibility, performance risk, UI quality when applicable, and basic security risk
- mention any platform-specific, remote/SSH-specific, agent-specific, integration-specific, or git-provider-specific behavior and testing notes

If there is no visual change, say that explicitly in the PR description.

## Release Process

Version bumps, tags, and releases are maintainer-managed. Do not include release version changes in a normal contribution unless a maintainer asks for them.

### Cutting a release (maintainers)

Run the **Cut Release** GitHub Actions workflow (`.github/workflows/release-cut.yml`) and choose the
release kind and source ref. It resolves the next version from GitHub Releases, bumps the workspace
and desktop package versions, tags the release, builds the enabled desktop platforms, verifies the
published artifacts, and only then makes the draft release visible. macOS signing runs in the
isolated `release-mac-build.yml` workflow. Windows artifacts are included only when the repository's
SignPath secret and variable are both configured; otherwise the release is intentionally macOS and
Linux only.
