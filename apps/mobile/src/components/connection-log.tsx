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
    <View className="bg-card border-hairline border-border max-h-60 w-full px-3 py-2">
      {title && (
        <Text className="text-muted-foreground/60 mb-1 font-mono text-xs tracking-[1px] uppercase">
          {title}
        </Text>
      )}
      <ScrollView
        ref={scrollRef}
        className="max-h-50"
        contentContainerClassName="gap-1.5"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {entries.map((entry) => (
          <View key={entry.id} className="flex-row items-start gap-2">
            <Text className="text-muted-foreground/60 w-[52px] pt-[1px] font-mono text-xs">
              {formatTime(entry.ts, baseTs)}
            </Text>
            <Text
              className={cn(
                'font-mono text-xs w-3 text-center pt-[1px]',
                LEVEL_COLOR_CLASS[entry.level]
              )}
            >
              {LEVEL_GLYPH[entry.level]}
            </Text>
            <View className="flex-1">
              <Text
                className={cn('font-mono text-xs leading-[16px]', LEVEL_COLOR_CLASS[entry.level])}
              >
                {entry.message}
              </Text>
              {entry.detail && (
                <Text
                  className="text-muted-foreground/60 mt-[1px] font-mono text-[11px] leading-[14px]"
                  numberOfLines={2}
                >
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
