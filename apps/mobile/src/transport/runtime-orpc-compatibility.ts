const RUNTIME_STREAM_PATHS = [
  ['accounts', 'subscribe'],
  ['browser', 'screencast', 'subscribe'],
  ['coworking', 'host', 'subscribeSessionChanges'],
  ['coworking', 'host', 'subscribeTerminal'],
  ['files', 'watch'],
  ['nativeChat', 'subscribe'],
  ['notifications', 'subscribe'],
  ['runtime', 'clientEvents', 'subscribe'],
  ['session', 'tabs', 'subscribe'],
  ['session', 'tabs', 'subscribeAll']
] as const

export function isRuntimeOrpcStreamPath(path: readonly string[]): boolean {
  return RUNTIME_STREAM_PATHS.some((candidate) => pathsEqual(path, candidate))
}

export function isRuntimeOrpcBrowserStreamPath(path: readonly string[]): boolean {
  return pathsEqual(path, ['browser', 'screencast', 'subscribe'])
}

export function isAsyncIterator(value: unknown): value is AsyncIterator<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'next' in value &&
    typeof value.next === 'function'
  )
}

function pathsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index])
}
