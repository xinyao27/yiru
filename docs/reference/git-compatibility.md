# Git compatibility policy

## Scope

Yiru executes the user's Git binary on native, WSL, and SSH hosts. Each host can have a different
Git version, so compatibility state must be scoped to the host that actually runs the command.

Git 2.25 is the core-workflow baseline for command selection. It covers the baseline use of
porcelain v2, `branch --show-current`, `restore`, and sparse checkout. Optional features that need a
newer Git must degrade safely and cache the missing capability. Yiru does not block older Git at
startup, but new command construction must not assume features introduced after this baseline.

## Capability rules

When a newer Git feature materially improves correctness or performance:

1. Keep a baseline-compatible command or parser as the fallback.
2. Detect rejection with a narrow predicate for that option or subcommand.
3. Run the preferred command through `GitCapabilityCache` so a rejection is remembered for the
   native host, WSL distro, or SSH provider that produced it.
4. Retry after the cache interval so an in-place Git upgrade self-heals without restarting Yiru.
5. Test the first fallback, later cached calls, concurrent probe coalescing, and execution-host
   isolation where applicable.

Do not branch only on a parsed `git --version`. Vendor builds can backport features, and wrappers
can report a host version that differs from the binary used inside WSL or SSH. A behavior probe plus
a precise fallback is the final authority.

## Current capabilities

| Capability | Preferred behavior | Compatibility behavior |
| --- | --- | --- |
| `worktree-list-z` | NUL-delimited worktree paths with `prunable` marks | Use the line-block parser before `worktree list -z` (Git 2.36); preserve `prunable`/`locked` annotations on Git 2.31–2.35 and probe path existence before Git 2.31. |
| `rev-parse-path-format` | Absolute repository metadata paths (Git 2.31) | Resolve legacy relative output against the scanned repository. |
| `for-each-ref-exclude` | Exclude remote HEAD before applying the result limit (Git 2.42) | Request extra refs, then filter remote HEAD in Yiru. |
| `merge-tree-write-tree` | Derive real-merge conflicts and no-op tree proofs | Omit the conflict summary and keep conservative branch cleanup before Git 2.38. |
| `merge-tree-merge-base` | Supply the already-resolved merge base (Git 2.40) | Use the older two-commit `merge-tree --write-tree` form. |

Commands that start with global Git options must preserve them before the subcommand. In
particular, worktree-create fetches keep `-c maintenance.auto=false` in the global-option position;
wrappers must not normalize it behind `fetch`.

## Why not `simple-git`

`simple-git` is a process wrapper around the installed Git binary. Its custom options and `raw` API
pass arguments through to Git, so it cannot make a newer flag work on an older binary or choose
Yiru's semantic fallback automatically. Yiru also needs native/WSL/SSH routing, cancellation,
tracing, redaction, process cleanup, and bounded output handling around the same capability rules.

## CI contract

PR checks run the capability contract against real Git 2.25.5, 2.38.1, and 2.54.0 binaries. This
spans the core-workflow baseline, the transitional `merge-tree --write-tree` behavior before
`--merge-base`, and a recent Git line. Docker images are pinned by manifest digest so a mutable
tag cannot silently replace the binary under test.

The ordinary test suite covers retry caching, concurrent probe behavior, and native/WSL/SSH host
isolation. The real-binary cases cover diagnostic and command shapes that mocks cannot reproduce.
