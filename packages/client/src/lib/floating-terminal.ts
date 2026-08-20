export const TOGGLE_FLOATING_TERMINAL_EVENT = 'yiru-toggle-floating-terminal'
export const OPEN_FLOATING_WORKSPACE_EVENT = 'yiru-open-floating-workspace'

// Why: maximize/restore lives in the panel's own keydown handler, but that
// handler is unmounted while the panel is closed. When Cmd+Opt+Shift+A is
// pressed with the panel closed, App records the request timestamp as plain
// state and passes it to the panel as a prop (`openMaximizedRequestAt`)
// instead of a module singleton the panel would have to reach out and
// destructively claim. The panel mounts within the same interaction as the
// request, so a request older than this window means the open was abandoned
// (prevented or interrupted before the panel noticed) — bounding it stops a
// stale request from leaking into a later, unrelated open and maximizing it
// unexpectedly.
export const OPEN_MAXIMIZED_INTENT_TTL_MS = 2000
