export const mobileWorktreePreviewStyles = {
  deviceScreen:
    'flex size-full flex-col overflow-hidden bg-neutral-50 font-sans text-[13px] text-neutral-950 [zoom:1.08]',
  chrome: 'bg-neutral-50 pt-[18px]',
  statusRow: 'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 px-4 pb-3',
  back: 'grid size-9 place-items-center text-neutral-950 [&>svg]:size-6 [&>svg]:stroke-[1.8]',
  hostName: 'justify-self-center text-[17px] font-semibold leading-6 text-neutral-950',
  headerActions: 'flex items-center gap-1',
  headerAction:
    'grid size-9 place-items-center text-neutral-950 [&>svg]:size-6 [&>svg]:stroke-[1.8]',
  listViewport: 'min-h-0 flex-1 overflow-hidden px-3 pb-3',
  repository: 'text-neutral-950',
  repositoryRow: 'flex min-h-12 items-center gap-3 px-2.5',
  repositoryEmoji: 'grid size-6 place-items-center text-[21px] leading-none',
  repositoryName: 'text-[17px] font-semibold leading-6',
  repositoryChevron: 'ml-auto size-6 text-neutral-600 [&>svg]:size-5 [&>svg]:stroke-[1.8]',
  workspaceTree: 'relative ml-5 border-l border-neutral-300 pl-5',
  workspaceRow: 'relative flex min-w-0 gap-2',
  workspaceStatus: 'grid size-5 shrink-0 place-items-center pt-0.5 text-neutral-500',
  workspaceMain: 'min-w-0 flex-1',
  branchRow:
    'flex min-h-8 items-center gap-2 text-[16px] leading-5 text-neutral-600 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:stroke-[1.8]',
  agentTree:
    'relative ml-5 mt-0.5 border-l border-neutral-200 pl-5 before:absolute before:-left-px before:top-0 before:h-full before:w-px before:bg-neutral-200',
  agentRow: 'flex min-h-6 min-w-0 items-center gap-1.5 text-neutral-500',
  agentIcon: 'grid size-4 shrink-0 place-items-center [&>svg]:size-4',
  agentLabel: 'min-w-0 flex-1 truncate text-[12px] leading-4',
  agentTime: 'shrink-0 text-[12px] leading-4 text-neutral-500',
  agentState: 'grid size-4 shrink-0 place-items-center text-neutral-500',
  doneDot: 'size-2 bg-emerald-500',
  tapping: 'animate-pulse motion-reduce:animate-none'
} as const
