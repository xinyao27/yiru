// Why: every tab type uses the same overlay contract so revealing close never
// changes tab width, while keyboard focus remains an accessible fallback.
export const TAB_CLOSE_BUTTON_CLASSES =
  'pointer-events-none absolute z-10 flex items-center justify-center bg-accent text-accent-foreground/70 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:text-accent-foreground hover:text-accent-foreground'
