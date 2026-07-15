// Why: the 4px drag region plus the 32px pane strip must stay aligned with
// both 36px sidebars, while one root divider prevents split panes from doubling it.
export const WORKSPACE_COLUMN_FRAME_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border'

export const WORKSPACE_COLUMN_DRAG_REGION_CLASS_NAME = 'h-[4px] shrink-0 bg-card'

export const WORKSPACE_COLUMN_BODY_CLASS_NAME = 'flex min-h-0 min-w-0 flex-1 overflow-hidden'
