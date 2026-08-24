import { gitExecFileAsync, gitExecFileSync } from './runner'

export type LocalGitExecOptions = {
  wslDistro?: string
}

type LocalDefaultBaseRefGitOptions = {
  cwd: string
  wslDistro?: string
}

const DEFAULT_BASE_REF_PROBE_TIMEOUT_MS = 15_000

export function gitExecOptions(
  cwd: string,
  options: LocalGitExecOptions = {}
): { cwd: string; wslDistro?: string } {
  return options.wslDistro ? { cwd, wslDistro: options.wslDistro } : { cwd }
}

/**
 * Ordered probe list used to resolve a repo's default base ref when no
 * explicit origin/HEAD symbolic-ref is set. `returnAs` is the short-name
 * format the UI expects (matches how `git for-each-ref --format=%(refname:short)`
 * would render the ref).
 *
 * Why: shared between the local path (getDefaultBaseRefAsync) and the SSH
 * relay path in src/main/project-groups/repos.ts so both resolve identical defaults
 * for equivalent repo states.
 */
export const DEFAULT_BASE_REF_PROBES: readonly { ref: string; returnAs: string }[] = [
  { ref: 'refs/remotes/origin/main', returnAs: 'origin/main' },
  { ref: 'refs/remotes/origin/master', returnAs: 'origin/master' },
  { ref: 'refs/heads/main', returnAs: 'main' },
  { ref: 'refs/heads/master', returnAs: 'master' }
]

/**
 * Walk DEFAULT_BASE_REF_PROBES in order, returning the first ref whose
 * existence is confirmed by `hasRef`. Returns null if none exist.
 *
 * Why: abstracts the "how do we test a ref exists" detail so the local
 * path (hasGitRefAsync) and the SSH path (provider.exec rev-parse) can
 * share a single authoritative probe ordering.
 */
async function resolveDefaultBaseRefFromProbes(
  hasRef: (ref: string) => Promise<boolean>
): Promise<string | null> {
  for (const { ref, returnAs } of DEFAULT_BASE_REF_PROBES) {
    if (await hasRef(ref)) {
      return returnAs
    }
  }
  return null
}

/**
 * Check if a path is a valid git repository (regular or bare).
 */

function hasGitRef(path: string, ref: string): boolean {
  try {
    gitExecFileSync(['rev-parse', '--verify', ref], {
      cwd: path
    })
    return true
  } catch {
    return false
  }
}

function gitRefToDefaultBaseRef(ref: string): string {
  return ref.replace(/^refs\/remotes\//, '')
}

function getVerifiedOriginHeadBaseRef(path: string): string | null {
  try {
    const ref = gitExecFileSync(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], {
      cwd: path
    }).trim()

    // Why: origin/HEAD may survive a default-branch rename while pointing at a
    // deleted ref; verify before trusting it over the probe list.
    return ref && hasGitRef(path, ref) ? gitRefToDefaultBaseRef(ref) : null
  } catch {
    return null
  }
}

/**
 * Resolve the default base ref for new worktrees.
 * Prefer the remote primary branch over a potentially stale local branch.
 *
 * Why: returns `null` when no candidate ref is resolvable. Previously this
 * fell through to a hardcoded `'origin/main'` even when that ref did not
 * exist, which silently handed `git worktree add` a bad ref and produced
 * an opaque git error. Callers now fail loudly with a useful message, or
 * degrade gracefully for non-creation uses (e.g. hosted URL building).
 */
export function getDefaultBaseRef(path: string): string | null {
  const originHeadBaseRef = getVerifiedOriginHeadBaseRef(path)
  if (originHeadBaseRef) {
    return originHeadBaseRef
  }

  // Why: walk the shared DEFAULT_BASE_REF_PROBES list so the sync path and the
  // async/SSH paths cannot drift on which refs are tried or in what order.
  for (const { ref, returnAs } of DEFAULT_BASE_REF_PROBES) {
    if (hasGitRef(path, ref)) {
      return returnAs
    }
  }
  return null
}

export async function getBaseRefDefault(
  path: string,
  options: LocalGitExecOptions = {}
): Promise<string | null> {
  return getDefaultBaseRefAsync(path, options)
}

/**
 * Return { ahead, behind } for localRef vs remoteRef, or null on git failure.
 *
 * Why: `rev-list --left-right --count A...B` emits `<ahead>\t<behind>` —
 * ahead = commits on A not reachable from B; behind = commits on B not
 * reachable from A. This is the merge-base-symmetric delta used by the
 * stale-base dispatch guard (§3.1). Returning null on any failure (bad
 * ref, corrupt repo, non-numeric output) lets callers degrade gracefully
 * instead of failing dispatch on a probe error.
 */

export type GitExec = (argv: string[]) => Promise<{ stdout: string }>

async function hasGitRefViaExec(exec: GitExec, ref: string): Promise<boolean> {
  try {
    await exec(['rev-parse', '--verify', '--quiet', ref])
    return true
  } catch {
    return false
  }
}

async function resolveVerifiedOriginHeadBaseRefViaExec(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
    const ref = stdout.trim()
    if (!ref || !(await hasGitRefViaExec(exec, ref))) {
      return null
    }
    return gitRefToDefaultBaseRef(ref)
  } catch {
    return null
  }
}

/**
 * Resolve the default base ref given a git exec callback. Prefers
 * origin/HEAD's symbolic-ref target; falls back to DEFAULT_BASE_REF_PROBES.
 *
 * Why: shared between the local path (via gitExecFileAsync) and the SSH
 * relay path (via provider.exec) so both paths return identical results
 * for equivalent repo states. Accepting an exec callback avoids coupling
 * this helper to either transport. Callers that want transport-level
 * diagnostics should log inside their own exec callback before rethrowing —
 * this helper swallows symbolic-ref's catch because a non-zero exit is the
 * expected signal for "origin/HEAD is unset" and not distinguishable here
 * from a genuine transport failure.
 */
export async function resolveDefaultBaseRefViaExec(exec: GitExec): Promise<string | null> {
  const originHeadBaseRef = await resolveVerifiedOriginHeadBaseRefViaExec(exec)
  if (originHeadBaseRef) {
    return originHeadBaseRef
  }
  return resolveDefaultBaseRefFromProbes((ref) => hasGitRefViaExec(exec, ref))
}

export function resolveDefaultBaseRefWithLocalGit(
  options: LocalDefaultBaseRefGitOptions
): Promise<string | null> {
  return resolveDefaultBaseRefViaExec((argv) =>
    gitExecFileAsync(argv, {
      ...options,
      // Why: async avoids main-thread stalls, but dead local/WSL filesystems still need a bound.
      timeout: DEFAULT_BASE_REF_PROBE_TIMEOUT_MS
    })
  )
}

export async function getDefaultBaseRefAsync(
  path: string,
  options: LocalGitExecOptions = {}
): Promise<string | null> {
  return resolveDefaultBaseRefWithLocalGit(gitExecOptions(path, options))
}

/**
 * Build the argv for `git for-each-ref` used by ref search, given an
 * already-normalized query string.
 *
 * Why: glob `refs/remotes/*\/*` (not `refs/remotes/origin/*`) so fork
 * workflows can discover branches from any configured remote (e.g.
 * `upstream/main`). The picker would otherwise structurally deny the
 * correct answer for fork contributors — see docs/upstream-base-ref-design.md.
 *
 * Why paired leaf/ancestor globs for a single-segment query: `git for-each-ref`
 * uses fnmatch-style globs where `*` does NOT cross `/`. Slash-named branch
 * refs need an ancestor-segment glob for `user` in `user/feature`, a leaf glob
 * for `feature`, and the same remote-side shape so typing a remote name like
 * `upstream` keeps working.
 *
 * Why the multi-segment branch: the picker displays results as
 * `upstream/main`, so users naturally retype that format. With a single
 * glob, `upstream/main` becomes `refs/remotes/*upstream/main*\/*` — five
 * path segments, zero matches. Splitting on `/` and emitting one
 * `*<token>*` per ref segment maps directly to git's ref structure
 * (`refs/remotes/<remote>/<branch>`, `refs/heads/<branch>`) and makes
 * display-format queries actually find the ref on screen.
 *
 * Why shared: the local path and the SSH relay path must send the exact
 * same argv so results cannot diverge between transports.
 */
