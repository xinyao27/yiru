// Why: tabs share one geometry and flat keyboard-focus contract so pane types
// cannot drift or fall back to the browser's native focus ring.
export const TAB_ROOT_CLASSES =
  'group relative my-auto flex h-7 items-center px-2 text-xs cursor-pointer select-none outline-none focus:outline-none focus-visible:bg-accent'
