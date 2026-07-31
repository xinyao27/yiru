export const mobileTerminalPreviewStyles = {
  deviceScreen:
    'flex size-full flex-col bg-neutral-950 font-sans text-[13px] text-neutral-200 [zoom:1.08]',
  statusDot: 'size-[7px] shrink-0 bg-green-500',
  chrome: 'border-b border-neutral-800 bg-neutral-900 pt-[18px]',
  topbar: 'flex min-h-12 items-center gap-2 px-3 pb-2 pt-1',
  back: 'grid size-8 place-items-center text-neutral-400 [&>svg]:size-[22px] [&>svg]:stroke-[2.2]',
  titleBlock: 'min-w-0 flex-1',
  sessionTitle: 'text-[15px] font-semibold text-neutral-200',
  metaRow: 'mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400',
  iconButton:
    'grid size-8 place-items-center text-neutral-400 [&>svg]:size-[18px] [&>svg]:stroke-[2.1]',
  tabbar: 'flex h-9 items-stretch border-t border-neutral-800',
  tab: 'flex max-w-32 items-center justify-center gap-1 border-b-2 border-transparent px-3 text-[13px] text-neutral-400 [&>svg]:size-[13px] [&>svg]:stroke-[2.1]',
  tabActive: 'border-blue-500 text-neutral-200',
  tabAdd: 'grid w-10 place-items-center text-neutral-400 [&>svg]:size-4 [&>svg]:stroke-[2.2]',
  terminal:
    'flex-1 overflow-hidden whitespace-pre-wrap break-words bg-slate-950 px-3.5 py-3 font-mono text-[11px] leading-[1.55] text-indigo-200 [overflow-wrap:anywhere]',
  line: 'block',
  prompt: 'text-blue-400',
  command: 'text-indigo-200',
  comment: 'text-slate-500',
  warning: 'text-amber-300',
  success: 'text-lime-400',
  tool: 'text-purple-400',
  middle: 'text-slate-300',
  dim: 'text-slate-500',
  cursor:
    'inline-block h-[13px] w-[7px] animate-pulse bg-indigo-200 align-text-bottom motion-reduce:animate-none',
  accessoryBar: 'overflow-hidden border-t border-neutral-800 bg-neutral-900',
  accessoryContent: 'flex items-center gap-1 overflow-hidden px-[7px] py-1',
  accessoryKey:
    'inline-flex min-w-6 shrink-0 items-center justify-center bg-neutral-800 px-1.5 py-1 font-mono text-[11px] text-neutral-400',
  accessoryIcon: 'px-2 [&>svg]:size-3.5 [&>svg]:stroke-[1.75]',
  inputBar: 'flex items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-3 py-1.5',
  textInput: 'flex-1 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-600',
  roundButton:
    'grid size-[34px] shrink-0 place-items-center bg-neutral-800 text-neutral-400 [&>svg]:size-[17px] [&>svg]:stroke-[2.4]'
} as const
