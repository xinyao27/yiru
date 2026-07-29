import { cn } from '@/style/class-names'

export const mobilePrComposeFormStyles = {
  branchToken: cn('max-w-28 text-foreground text-xs font-mono'),

  notice: cn('flex-row items-start gap-1'),
  noticeText: cn('flex-1 text-muted-foreground text-xs leading-5')
} as const
