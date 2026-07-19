export const mobileHomePreviewStyles = {
  deviceScreen:
    'flex size-full flex-col bg-neutral-950 font-sans text-[13px] text-neutral-200 [zoom:1.08]',
  topbar: 'flex items-center justify-between px-4 pb-3 pt-[26px]',
  brand: 'flex items-center gap-2',
  logo: 'size-[22px] text-neutral-200',
  brandName: 'text-[17px] font-bold text-neutral-200',
  iconButton:
    'grid size-9 place-items-center bg-transparent text-neutral-400 [&>svg]:size-[18px] [&>svg]:stroke-[1.75]',
  scrollRegion: 'flex-1 overflow-hidden px-4 pb-4',
  greeting: 'px-1 pb-2.5 pt-1.5',
  greetingTitle: 'text-[22px] font-extrabold text-neutral-200',
  statRow: 'mb-4 grid grid-cols-3 gap-2',
  statCard: 'border border-neutral-800 bg-neutral-900/60 px-2.5 py-2',
  statValue: 'text-[17px] font-bold text-neutral-200',
  statLabel: 'mt-px whitespace-nowrap text-[10px] font-medium text-neutral-600',
  sectionLabel: 'mb-1.5 ml-1 text-[10px] font-semibold uppercase tracking-[.06em] text-neutral-600',
  hostCard:
    'flex min-h-[60px] items-center gap-3 border border-neutral-800 bg-neutral-900 px-3 py-2.5 [&+&]:mt-1.5',
  hostIcon:
    'grid size-[38px] place-items-center bg-neutral-800 text-neutral-200 [&>svg]:size-[18px] [&>svg]:stroke-[1.75]',
  hostIconDim: 'text-neutral-400',
  hostMain: 'min-w-0 flex-1',
  hostName: 'text-sm font-semibold leading-[18px] text-neutral-200',
  hostNameDim: 'text-neutral-400',
  hostMeta: 'mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-neutral-400',
  statusDot: 'size-[7px] shrink-0',
  statusGreen: 'bg-green-500',
  statusMuted: 'bg-neutral-600',
  chevron: 'text-neutral-600 [&>svg]:size-4 [&>svg]:stroke-[1.75]',
  resumeCard: 'flex items-center gap-3 border border-neutral-800 bg-neutral-900 px-3 py-2.5',
  resumeIcon:
    'grid size-[38px] place-items-center bg-neutral-800 text-neutral-400 [&>svg]:size-4 [&>svg]:stroke-[1.75]',
  resumeTitle: 'text-[13px] font-semibold text-neutral-200',
  resumeSub: 'mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400',
  repoDot: 'size-[7px] shrink-0',
  quickActions: 'mb-2 grid grid-cols-2 gap-2',
  quickAction: 'flex items-center gap-2.5 border border-neutral-800 bg-neutral-900 px-3 py-2.5',
  quickActionIcon:
    'grid size-7 place-items-center bg-white/5 text-neutral-400 [&>svg]:size-4 [&>svg]:stroke-[1.75]',
  quickActionLabel: 'whitespace-nowrap text-xs font-semibold text-neutral-400',
  accountsCard: 'flex flex-col gap-2 border border-neutral-800 bg-neutral-900 px-3 py-2.5',
  accountsRow: 'flex items-center gap-2.5',
  accountsIcon:
    'grid size-8 place-items-center bg-neutral-800 text-neutral-200 [&>svg]:size-[18px]',
  accountsInfo: 'flex min-w-0 flex-1 flex-col gap-0.5',
  accountsEmail: 'text-[13px] font-semibold text-neutral-200',
  accountsBars: 'mt-1 flex gap-3',
  usageBar: 'flex flex-1 items-center gap-1.5',
  usageBarLabel: 'min-w-4 text-[11px] font-semibold text-neutral-600',
  usageBarTrack: 'h-1 flex-1 overflow-hidden bg-neutral-800',
  usageBarFill: 'h-full bg-neutral-400'
} as const
