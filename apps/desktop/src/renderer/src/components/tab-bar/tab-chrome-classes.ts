// Why: the strip owns its outer edges; the canonical border keeps tab
// dividers consistent while inactive tabs avoid duplicate left borders.
export const TAB_ROOT_CLASSES =
  'group relative flex h-full items-center border-r border-border px-3 text-xs cursor-pointer select-none outline-none transition-[background,color] duration-100 motion-reduce:transition-none focus:outline-none focus-visible:bg-accent'

// Why: the reference chrome uses compact 14px identity glyphs with an 8px
// title gap; sharing the rule keeps every tab content type aligned.
export const TAB_LEADING_ICON_CLASSES = 'mr-2 size-3.5 shrink-0'

// Why: selected tabs and their bodies share the canonical app canvas as one plane.
export const TAB_CONTENT_SURFACE_CLASSES = 'bg-background text-foreground'

export function getTitlebarTabStateClasses(isActive: boolean): string {
  // Why: active tabs own matching side seams and overlap the preceding divider
  // by 1px, while their opaque surface masks the strip seam below.
  return isActive
    ? '-ml-px w-[calc(100%+1px)] border-l bg-background text-foreground'
    : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground'
}
