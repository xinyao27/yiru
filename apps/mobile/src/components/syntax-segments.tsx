import { cn } from 'cnfast'
import { Text } from 'react-native'

import type { MobileSyntaxSegment, MobileSyntaxTokenKind } from '../session/file-syntax'

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
  comment: cn('text-syntax-comment'),
  keyword: cn('text-syntax-keyword'),
  string: cn('text-syntax-string'),
  number: cn('text-syntax-number'),
  type: cn('text-syntax-type'),
  function: cn('text-syntax-function'),
  variable: cn('text-syntax-variable'),
  meta: cn('text-syntax-meta')
} as const
