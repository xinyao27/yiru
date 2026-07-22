import { Text } from 'react-native'

import { cn } from '@/style/class-names'

import type { MobileSyntaxSegment, MobileSyntaxTokenKind } from '../session/mobile-file-syntax'

export function MobileSyntaxSegments({ segments }: { segments: MobileSyntaxSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        <Text key={`${index}:${segment.kind}`} className={syntaxTokenStyles[segment.kind]}>
          {segment.text}
        </Text>
      ))}
    </>
  )
}

const syntaxTokenStyles: Record<MobileSyntaxTokenKind, string> = {
  plain: cn('text-foreground'),
  comment: cn('text-[var(--syntax-comment)]'),
  keyword: cn('text-[var(--syntax-keyword)]'),
  string: cn('text-[var(--syntax-string)]'),
  number: cn('text-[var(--syntax-number)]'),
  type: cn('text-[var(--syntax-type)]'),
  function: cn('text-[var(--syntax-function)]'),
  variable: cn('text-[var(--syntax-variable)]'),
  meta: cn('text-[var(--syntax-meta)]')
} as const
