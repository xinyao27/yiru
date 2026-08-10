// Why: repository mutations originate in IPC handlers that do not own the
// runtime service. The runtime installs this publisher so headless web/mobile
// clients receive the same invalidation as a desktop renderer.
let publish: () => void = () => {}

export function setRepoChangeEventPublisher(publisher: () => void): void {
  publish = publisher
}

export function publishRepoChangeEvent(): void {
  publish()
}
