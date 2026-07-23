// Why: tabs fill the 40px titlebar; its shared bottom hairline closes every
// segment without stacking a second border beneath the tab.
export const TAB_ROOT_CLASSES =
  'group relative flex h-full items-center border-x border-t border-border px-3 text-xs cursor-pointer select-none outline-none transition-[background,color] duration-100 motion-reduce:transition-none focus:outline-none focus-visible:bg-accent'

// Why: the reference chrome uses compact 14px identity glyphs with an 8px
// title gap; sharing the rule keeps every tab content type aligned.
export const TAB_LEADING_ICON_CLASSES = 'mr-2 size-3.5 shrink-0'
