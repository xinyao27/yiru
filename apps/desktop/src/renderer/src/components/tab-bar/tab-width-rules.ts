// Why: the reference chrome gives ordinary tabs a stable 128px footprint;
// adjacent bordered cells overlap by one pixel so shared seams stay hairline.
export const TAB_CONTAINER_WIDTH_CLASSES =
  'grid -ml-px min-w-32 max-w-[240px] flex-[0_1_auto] grid-cols-[minmax(0,1fr)] items-center first:ml-0'

export const TAB_LABEL_WIDTH_CLASSES = 'min-w-0 flex-1 truncate'
