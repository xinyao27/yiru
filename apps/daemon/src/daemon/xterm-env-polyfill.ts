// @xterm/headless checks for `window` to detect browser vs node environment.
// In the Bun daemon, `window` is undefined. This polyfill must be
// imported before any @xterm/headless import.
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as Record<string, unknown>).window = globalThis
}
