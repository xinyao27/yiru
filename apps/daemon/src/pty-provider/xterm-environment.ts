// Why: @xterm/headless checks `window` during module evaluation even in a Bun daemon.
if (typeof globalThis.window === 'undefined') {
  Reflect.set(globalThis, 'window', globalThis)
}
