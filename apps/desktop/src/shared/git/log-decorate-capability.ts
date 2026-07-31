// Why: Git does not error on an unrecognized `%(...)` pretty-format
// placeholder — it prints the placeholder text back literally and exits 0
// (confirmed: `git log -1 --format='X%(bogusplaceholder)Y'` on old Git prints
// `X%(bogusplaceholder)Y` with exit code 0). So there is no thrown error to
// sniff for `%(decorate:...)` (added in Git 2.34) on the 2.25 baseline — the
// only reliable signal is content-based: the literal `%(decorate` substring
// surviving into stdout. `GitCapabilityCache.runWithFallback` only branches
// on a thrown error, so the preferred callback throws this sentinel when it
// detects the passthrough, instead of bolting on a second capability
// mechanism.
export class GitLogDecorateFormatModifierUnsupportedSignal extends Error {
  constructor() {
    super('git left the %(decorate:...) format placeholder unexpanded')
  }
}

export function isLogDecorateFormatModifierUnsupportedError(error: unknown): boolean {
  return error instanceof GitLogDecorateFormatModifierUnsupportedSignal
}
