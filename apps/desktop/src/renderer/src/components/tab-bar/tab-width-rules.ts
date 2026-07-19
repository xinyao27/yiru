// Why: tabs hug their content, but the zero-min grid track constrains long
// labels to the 240px cap so ellipsis renders instead of crossing into siblings.
export const TAB_CONTAINER_WIDTH_CLASSES =
  'grid min-w-[88px] max-w-[240px] flex-[0_1_auto] grid-cols-[minmax(0,1fr)] items-center'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-1 truncate'
