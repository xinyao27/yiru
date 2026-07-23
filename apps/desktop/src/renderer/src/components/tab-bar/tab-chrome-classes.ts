// Why: tabs fill the 36px titlebar; its shared bottom hairline closes every
// segment without stacking a second border beneath the tab.
export const TAB_ROOT_CLASSES =
  'group relative flex h-full items-center border-x border-t border-border px-3 text-xs cursor-pointer select-none outline-none transition-[background,color] duration-100 motion-reduce:transition-none focus:outline-none focus-visible:bg-accent'

// Why: the reference chrome uses compact 14px identity glyphs with an 8px
// title gap; sharing the rule keeps every tab content type aligned.
export const TAB_LEADING_ICON_CLASSES = 'mr-2 size-3.5 shrink-0'

export function getTitlebarTabStateClasses(isActive: boolean): string {
  // Why: selected titlebar tabs in the reference differ from the strip only
  // slightly; mixing the existing roles keeps that quiet contrast theme-safe.
  return isActive
    ? 'bg-[color-mix(in_srgb,var(--accent)_50%,var(--card))] text-muted-foreground'
    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground'
}
