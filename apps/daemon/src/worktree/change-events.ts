// Why: worktree mutations originate in both IPC handlers and headless
// directory watchers. The runtime installs this publisher once so those
// producers do not need a BrowserWindow or a runtime service reference.
let publish: (repoId: string) => void = () => {}

export function setWorktreeChangeEventPublisher(publisher: (repoId: string) => void): void {
  publish = publisher
}

export function publishWorktreeChangeEvent(repoId: string): void {
  publish(repoId)
}
