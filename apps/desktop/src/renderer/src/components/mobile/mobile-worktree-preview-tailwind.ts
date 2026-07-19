export const mobileWorktreePreviewStyles = {
  deviceScreen:
    'flex size-full flex-col bg-neutral-950 font-sans text-[13px] text-neutral-200 [zoom:1.08]',
  chrome: 'border-b border-neutral-800 bg-neutral-900 pt-[18px]',
  statusRow: 'flex min-h-[34px] items-center gap-2.5 px-4 pt-1',
  back: 'mr-1 grid size-8 place-items-center text-neutral-200 [&>svg]:size-[22px] [&>svg]:stroke-[1.75]',
  host: 'flex min-w-0 flex-1 items-center gap-2',
  statusDot: 'size-[7px] shrink-0 bg-green-500',
  hostName: 'text-[15px] font-semibold text-neutral-200',
  toolbar: 'flex items-center gap-2 border-b border-neutral-800 px-3 py-1.5',
  chip: 'flex items-center gap-1 border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 [&>svg]:size-3 [&>svg]:stroke-[1.75]',
  button:
    'flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 [&>svg]:size-3.5 [&>svg]:stroke-[1.75]',
  spacer: 'flex-1',
  icon: 'grid size-6 place-items-center text-neutral-400 [&>svg]:size-4 [&>svg]:stroke-[1.75]',
  section:
    'flex items-center gap-1 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.06em] text-neutral-600 [&>svg]:size-3 [&>svg]:stroke-2',
  list: 'flex flex-col',
  row: 'flex items-start gap-2 px-4 py-2.5',
  separator: 'mr-4 ml-10 h-px bg-neutral-800',
  indicator: 'grid w-5 place-items-center pt-1.5',
  dot: 'size-2',
  dotGreen: 'bg-emerald-500',
  dotMuted: 'bg-neutral-500/40',
  dotRed: 'bg-red-500',
  main: 'min-w-0 flex-1',
  nameRow: 'flex items-center gap-2',
  name: 'text-sm font-semibold text-neutral-200',
  pullRequest:
    'inline-flex items-center gap-[3px] bg-neutral-800 px-[5px] py-px text-[10px] text-neutral-400 [&>svg]:size-2.5 [&>svg]:stroke-[1.75]',
  metaRow: 'mt-0.5 flex items-center gap-1 text-[11px] text-neutral-400',
  repoDot: 'size-1.5 shrink-0',
  branch: 'font-mono text-neutral-600',
  preview: 'mt-0.5 truncate font-mono text-[11px] text-neutral-600',
  terminalCount: 'min-w-4 pt-[3px] text-right text-xs text-neutral-600',
  tapping: 'animate-pulse motion-reduce:animate-none'
} as const
