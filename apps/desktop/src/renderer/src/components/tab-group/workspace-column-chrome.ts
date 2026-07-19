// Why: one root divider (border-l) between the left sidebar and the terminal
// area prevents split panes from each painting their own and doubling it.
export const WORKSPACE_COLUMN_FRAME_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border'

export const WORKSPACE_COLUMN_BODY_CLASS_NAME = 'flex min-h-0 min-w-0 flex-1 overflow-hidden'
