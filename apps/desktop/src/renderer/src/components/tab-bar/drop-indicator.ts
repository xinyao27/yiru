export type DropIndicator = 'left' | 'right' | null

// Why: the theme's accent color is too subtle for a drag-and-drop insertion
// cue. A vivid blue matches VS Code's tab.dragAndDropBorder and is immediately
// visible against all tab backgrounds. Pseudo-elements sit above the tab's
// own border so the indicator does not shift layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'bg-accent text-accent-foreground'
    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground'
}

export function getTitlebarTabStateClasses(isActive: boolean): string {
  // Why: selected titlebar tabs in the reference differ from the strip only
  // slightly; mixing the existing roles keeps that quiet contrast theme-safe.
  return isActive
    ? 'bg-[color-mix(in_srgb,var(--accent)_50%,var(--card))] text-muted-foreground'
    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground'
}
