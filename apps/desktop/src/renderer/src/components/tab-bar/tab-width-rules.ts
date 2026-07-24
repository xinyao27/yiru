// Why: tabs draw only their right divider, so containers must not overlap or
// the next tab's background would hide the selected tab's left boundary.
export const TAB_CONTAINER_WIDTH_CLASSES =
  'grid min-w-32 max-w-[240px] flex-[0_1_auto] grid-cols-[minmax(0,1fr)] items-center'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-1 truncate'
