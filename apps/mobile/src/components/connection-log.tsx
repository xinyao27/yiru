import { useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import type { ConnectionLogEntry } from '../transport/types'

type Props = {
  entries: ConnectionLogEntry[]
  // Tag printed before the first entry so it's clear what's being logged
  // (e.g. 'Pairing' vs 'Reconnect').
  title?: string
}

const LEVEL_COLOR_CLASS: Record<ConnectionLogEntry['level'], string> = {
  info: 'text-muted-foreground',
  success: 'text-green-500',
  warn: 'text-amber-500',
  error: 'text-red-500'
}

const LEVEL_GLYPH: Record<ConnectionLogEntry['level'], string> = {
  info: '•',
  success: '✓',
  warn: '!',
  error: '✕'
}

function formatTime(ts: number, baseTs: number): string {
  // Why: show elapsed seconds since the first entry — absolute wall-clock
  // time isn't actionable when debugging "why is connecting stuck".
  const elapsed = Math.max(0, ts - baseTs) / 1000
  if (elapsed < 10) {
    return `+${elapsed.toFixed(2)}s`
  }
  if (elapsed < 100) {
    return `+${elapsed.toFixed(1)}s`
  }
  return `+${Math.round(elapsed)}s`
}

export function ConnectionLog({ entries, title }: Props) {
  const scrollRef = useRef<ScrollView | null>(null)

  if (entries.length === 0) {
    return null
  }
  const baseTs = entries[0]!.ts

  return (
    <View className={styles.container}>
      {title && <Text className={styles.title}>{title}</Text>}
      <ScrollView
        ref={scrollRef}
        className={styles.scroll}
        contentContainerClassName={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {entries.map((entry) => (
          <View key={entry.id} className={styles.row}>
            <Text className={styles.timestamp}>{formatTime(entry.ts, baseTs)}</Text>
            <Text className={cn(styles.glyph, LEVEL_COLOR_CLASS[entry.level])}>
              {LEVEL_GLYPH[entry.level]}
            </Text>
            <View className={styles.rowText}>
              <Text className={cn(styles.message, LEVEL_COLOR_CLASS[entry.level])}>
                {entry.message}
              </Text>
              {entry.detail && (
                <Text className={styles.detail} numberOfLines={2}>
                  {entry.detail}
                </Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = {
  container: cn('w-full max-h-60 bg-card rounded-none border-hairline border-border py-2 px-3'),
  title: cn('text-[12px] font-mono text-muted-foreground/60 uppercase tracking-[1px] mb-1'),
  scroll: cn('max-h-50'),
  scrollContent: cn('gap-1.5'),
  row: cn('flex-row items-start gap-2'),
  timestamp: cn('font-mono text-[12px] text-muted-foreground/60 w-[52px] pt-[1px]'),
  glyph: cn('font-mono text-[12px] w-3 text-center pt-[1px]'),
  rowText: cn('flex-1'),
  message: cn('font-mono text-[12px] leading-[16px]'),
  detail: cn('font-mono text-[11px] text-muted-foreground/60 leading-[14px] mt-[1px]')
} as const
