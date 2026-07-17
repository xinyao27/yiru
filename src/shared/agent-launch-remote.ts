/** Why: `connectionId` is the SSH signal; WSL and local execution stay false. */
export function repoIsRemote(repo: { connectionId?: string | null }): boolean {
  return Boolean(repo.connectionId)
}
