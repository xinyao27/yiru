import { cn } from '@/style/class-names'

export const styles = {
  root: cn('gap-2'),
  paragraph: cn('text-[13px] leading-[19px] text-foreground'),
  heading: cn('text-[14px] leading-[20px] font-bold text-foreground'),
  headingLarge: cn('text-[15px] leading-[21px]'),
  bold: cn('font-bold text-foreground'),
  italic: cn('italic'),
  strike: cn('line-through'),
  link: cn('text-primary underline'),
  inlineCode: cn('font-mono text-[12px] text-foreground bg-secondary rounded-none px-1'),
  inlineCodeLink: cn('text-primary underline'),
  quote: cn('border-l-2 border-l-border pl-2'),
  quoteText: cn('text-[13px] leading-[19px] text-muted-foreground'),
  codeBlock: cn('bg-secondary border border-border rounded-none p-2'),
  codeLanguage: cn('text-[10px] text-muted-foreground/60 mb-1 uppercase'),
  codeText: cn('font-mono text-[12px] leading-[17px] text-foreground'),
  imageFrame: cn('border border-border rounded-none bg-secondary overflow-hidden p-2'),
  imageCaption: cn('px-2 py-1 text-[11px] text-muted-foreground'),
  table: cn('border-t border-l border-border rounded-none overflow-hidden bg-card'),
  tableRow: cn('flex-row'),
  tableCell: cn(
    'min-w-28 max-w-[220px] border-r border-b border-border px-2 py-1 text-[12px] leading-[17px] text-foreground'
  ),
  tableHeader: cn('font-bold bg-secondary'),
  tableTruncated: cn('p-2 text-[12px] text-muted-foreground/60'),
  list: cn('gap-1'),
  listItem: cn('flex-row items-start gap-2'),
  listMarker: cn('w-[22px] text-[13px] leading-[19px] text-muted-foreground font-mono'),
  listText: cn('flex-1 min-w-0 text-[13px] leading-[19px] text-foreground'),
  rule: cn('h-hairline bg-border')
} as const
