const EVENT_ITERATOR_PATHS = new Set([
  'accounts.subscribe',
  'agentStatus.events.subscribe',
  'browser.guestEvents.subscribe',
  'browser.screencast.subscribe',
  'emulator.events.subscribe',
  'emulator.frameStream.subscribe',
  'emulator.videoStream.subscribe',
  'files.watch',
  'files.watchLogTail',
  'github.events.subscribe',
  'notifications.subscribe',
  'projectGroup.events.subscribe',
  'runtime.clientEvents.subscribe',
  'runtime.driverEvents.subscribe',
  'runtime.progressEvents.subscribe',
  'session.tabs.subscribe',
  'session.tabs.subscribeAll',
  'settings.events.subscribe',
  'skills.manage.events.subscribe',
  'terminal.multiplex',
  'terminal.subscribe',
  'ui.events.subscribe',
  'workspaceCleanup.events.subscribe',
  'workspaceEvents.subscribe',
  'workspacePorts.events.subscribe',
  'workspaceSpace.events.subscribe',
  'worktree.stateEvents.subscribe'
])

export function isRuntimeOrpcEventIteratorPath(path: readonly string[]): boolean {
  return EVENT_ITERATOR_PATHS.has(path.join('.'))
}
