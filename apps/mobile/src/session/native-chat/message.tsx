import type { NativeChatBlock, NativeChatMessage } from '@yiru/workbench-model/agent'
import { cn } from 'cnfast'
import * as Clipboard from 'expo-clipboard'
import { memo, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileMarkdown } from '~/components/markdown'
import { ImageSquare } from '~/components/uniwind-icons'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { isImageRefBlock, isTextBlock, splitNativeChatBlocks } from './blocks'
import { nativeChatMessageText } from './message-text'
import { withOccurrenceKeys } from './occurrence-keys'
import { MobileNativeChatToolDetailsDrawer } from './tool-details-drawer'
import { summarizeMobileToolRun } from './tool-summary'

function Prose({
  block,
  invert,
  fontScale,
  onOpenFile
}: {
  block: NativeChatBlock
  invert?: boolean
  fontScale: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element | null {
  const textSize = resolveCssNumber(useCSSVariable('--text-base'))
  if (isTextBlock(block)) {
    // Inverted (user) bubbles use a fixed dark-on-light text rather than the
    // markdown renderer's light-on-dark palette.
    if (invert) {
      return (
        <Text
          className="text-primary-foreground text-sm leading-6 font-medium"
          style={[{ fontSize: textSize * fontScale }]}
        >
          {block.text}
        </Text>
      )
    }
    return <MobileMarkdown content={block.text} textScale={fontScale} onOpenFile={onOpenFile} />
  }
  if (isImageRefBlock(block)) {
    return (
      <View className="flex-row items-center gap-1">
        <ImageSquare
          size={Math.round(textSize * fontScale)}
          colorClassName="accent-muted-foreground"
        />
        <Text
          className="text-muted-foreground flex-1 text-sm"
          style={[{ fontSize: textSize * fontScale }]}
        >
          {block.alt ?? block.path ?? block.url ?? 'image'}
        </Text>
      </View>
    )
  }
  return null
}

function ToolRunSummary({
  blocks,
  onOpenFile
}: {
  blocks: NativeChatBlock[]
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const [detailsVisible, setDetailsVisible] = useState(false)
  const summary = summarizeMobileToolRun(blocks)

  return (
    <View className="mt-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${summary}. Show details`}
        className="min-w-0 py-1 active:opacity-60"
        onPress={() => setDetailsVisible(true)}
        hitSlop={8}
      >
        <Text className="text-muted-foreground text-sm leading-6" numberOfLines={1}>
          {summary}
        </Text>
      </Pressable>
      <MobileNativeChatToolDetailsDrawer
        visible={detailsVisible}
        blocks={blocks}
        onClose={() => setDetailsVisible(false)}
        onOpenFile={onOpenFile}
      />
    </View>
  )
}

function AgentControls({
  copied,
  onCopy
}: {
  copied: boolean
  onCopy: () => void
}): React.JSX.Element {
  return (
    <View className="mb-1 flex-row justify-start">
      <MobileGlassIconButton
        accessibilityLabel="Copy message"
        icon={copied ? 'check' : 'copy'}
        onPress={onCopy}
        size="small"
      />
    </View>
  )
}

function MobileNativeChatMessageImpl({
  message,
  queued,
  fontScale = 1,
  onOpenFile
}: {
  message: NativeChatMessage
  queued?: boolean
  /** Multiplies all chat text sizes for pinch-to-zoom (1 = no change). */
  fontScale?: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isAgent = !isUser
  // Briefly tint the bubble to confirm a copy landed.
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current)
      }
    },
    []
  )
  // Why: tool activity belongs to its assistant turn, while user messages need
  // a filled bubble to stay distinct from the transcript's unboxed agent prose.
  const { prose, tools } = splitNativeChatBlocks(message.blocks)
  const keyedProse = withOccurrenceKeys(prose, (block) => {
    switch (block.type) {
      case 'text':
        return `text:${block.text}`
      case 'image-ref':
        return `image:${block.path ?? ''}:${block.url ?? ''}:${block.alt ?? ''}`
      case 'tool-call':
        return `tool-call:${block.name}:${JSON.stringify(block.input)}`
      case 'tool-result':
        return `tool-result:${block.isError === true}:${block.output}`
    }
  })

  const handleCopy = (): void => {
    const text = nativeChatMessageText(message.blocks)
    if (!text) {
      return
    }
    void Clipboard.setStringAsync(text)
    setCopied(true)
    if (copyTimer.current) {
      clearTimeout(copyTimer.current)
    }
    copyTimer.current = setTimeout(() => setCopied(false), 700)
  }

  const controls = isAgent && !queued ? <AgentControls copied={copied} onCopy={handleCopy} /> : null

  return (
    <View className={cn('px-4 py-2', isUser && 'items-end')}>
      {isUser && queued ? (
        <Text className="text-muted-foreground mb-1 text-xs font-semibold">Queued</Text>
      ) : null}
      <View
        className={cn(
          'max-w-full gap-2',
          isUser && 'max-w-7/8 rounded-2xl bg-primary px-3 py-2',
          isReasoning && 'opacity-70',
          queued && 'opacity-60',
          copied && 'bg-diff-inserted'
        )}
      >
        {keyedProse.map(({ key, value: block }) => (
          <Prose
            key={key}
            block={block}
            invert={isUser}
            fontScale={fontScale}
            onOpenFile={onOpenFile}
          />
        ))}
        {tools.length > 0 ? <ToolRunSummary blocks={tools} onOpenFile={onOpenFile} /> : null}
        {controls}
      </View>
    </View>
  )
}

export const MobileNativeChatMessage = memo(MobileNativeChatMessageImpl)
