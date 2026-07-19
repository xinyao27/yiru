// Why: dropdown and context menus are sibling interactions; sharing their row
// grammar keeps density, keyboard highlight, and destructive states identical.
export const menuItemClass =
  "relative flex cursor-default items-center gap-2 py-1 text-xs leading-5 font-medium outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!"

export const menuSubTriggerStateClass =
  'data-popup-open:bg-accent data-popup-open:text-accent-foreground'

export const menuLabelClass = 'px-2 py-1 text-[11px] font-semibold text-muted-foreground'

export const menuSeparatorClass = 'my-1 h-px bg-border/70'

export const menuShortcutClass =
  'ml-auto shrink-0 whitespace-nowrap text-[11px] tracking-normal text-muted-foreground/85'
