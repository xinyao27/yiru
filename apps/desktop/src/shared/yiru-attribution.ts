// Why: single source of truth for the commit trailer Yiru appends when the
// "Yiru Attribution" toggle (`enableGitHubAttribution`) is on. Used by both
// the terminal git/gh shim and the AI commit-message generator so the two
// code paths agree on the exact string.

export const YIRU_GIT_COMMIT_TRAILER = 'Co-authored-by: Yiru <noreply@yiru.ai>'
