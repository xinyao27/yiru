// Why: this used to read repo.connectionId as the SSH signal, but
// Repo.connectionId is dead — nothing sets it since remote hosts were removed
// (#63) — so every repo is local now; WSL execution stays false too.
export function repoIsRemote(_repo: { connectionId?: string | null }): boolean {
  return false
}
