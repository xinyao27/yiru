# Complete SSH, WSL, Windows, and packaging compatibility

Type: task
Status: done
Blocked by:

## Question

What changes make repository setup, shell launch, CLI fallback, worktree paths, and packaged Windows
resources correct on disconnected SSH, WSL, and Windows SSH relay hosts?

## Scope

- `92696558c`: keep disconnected SSH hosts representable while disabling import/clone actions that
  require a connected host.
- `2cbcf03b0`: qualify fallback worktree paths in the SSH host namespace.
- `c1d2c4be0`: restore the intended worktree cwd after a PowerShell profile runs.
- `26e48e415`: honor the OpenSSH registry `DefaultShell` for Windows SSH terminals.
- `1ace87c15`: run global `gh`/`glab` fallbacks in the user's pinned WSL distro.
- `48a258d50`: exclude duplicate/broken `resources/win32` command shims from `app.asar`.

## Ownership boundary

Use execution-host identity for capability caching, paths, and CLI routing. Reuse path/shell
utilities; never concatenate platform paths manually. Do not mark GitHub's restricted `git` shell as
a connected execution host because it cannot run Yiru commands.

## Acceptance

- Disconnected SSH setup has safe placeholder UX but cannot dispatch filesystem/network actions.
- Fallback worktree paths resolve on the SSH host, including Windows relay path forms.
- PowerShell and OpenSSH registry shell selection land in the requested worktree after profiles.
- `gh` and `glab` use the pinned WSL distro for global fallback discovery/execution.
- The unpacked Windows artifact contains the intended executable/shim exactly once.
- Tests cover native/WSL/SSH host isolation and supported shell/path variants; Git operations retain
  the Git 2.25 baseline and host-scoped capability behavior.

## Commit boundary

One remote-execution commit plus, if necessary, one narrowly separated packaging commit.
