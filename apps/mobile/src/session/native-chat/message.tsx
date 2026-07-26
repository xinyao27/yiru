import type { NativeChatBlock, NativeChatMessage } from '@yiru/workbench-model/agent'
import * as Clipboard from 'expo-clipboard'
import { memo, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MobileMarkdown } from '../../components/markdown'
import {
  ArrowUp,
  CaretDown as ChevronDown,
  Copy,
  ArrowSquareRight as SquareChevronRight
} from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import {
  isImageRefBlock,
  isTextBlock,
  pairToolBlocks,
  splitNativeChatBlocks,
  type ToolPair
} from './blocks'
import { diffFromText, diffFromToolCall, type DiffLine } from './diff'
import { MAX_TOOL_RESULT_CHARS, styles, TEXT_SIZE } from './message-styles'
import { nativeChatMessageText } from './message-text'
import { summarizeToolInput, summarizeToolRun, toolFilePath } from './tool-summary'

const MAX_VISIBLE_TOOL_PAIRS = 6
const MAX_TOOL_RUN_DIFF_ROWS = 240

function DiffView({ lines }: { lines: DiffLine[] }): React.JSX.Element {
  return (
    <View className="bg-card overflow-hidden py-1">
      {lines.map((line, i) => (
        <Text
          key={i}
          className={cn(
            'text-muted-foreground font-mono text-xs leading-[17px] px-2',
            line.kind === 'add' &&
              'text-[var(--git-decoration-added)] bg-[var(--editor-diff-inserted-line-background)]',
            line.kind === 'del' &&
              'text-[var(--git-decoration-deleted)] bg-[var(--editor-diff-removed-line-background)]',
            line.kind === 'meta' && 'text-muted-foreground/60'
          )}
        >
          {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
          {line.text}
        </Text>
      ))}
    </View>
  )
}

/** A single inline tool line — `▸ ToolName  preview` — that expands in place to
 *  show the call's diff/input or the result's body. Mirrors the reference design
 *  where tool calls read as flat lines in the conversation, not boxed blocks. */
function ResultBody({
  output,
  isError,
  diff
}: {
  output: string
  isError?: boolean
  diff: DiffLine[] | null
}): React.JSX.Element {
  if (diff) {
    return <DiffView lines={diff} />
  }
  return (
    <View
      className={cn('bg-card p-3', isError && 'bg-[var(--editor-diff-removed-line-background)]')}
    >
      <Text className={styles.mono}>
        {output.length > MAX_TOOL_RESULT_CHARS
          ? `${output.slice(0, MAX_TOOL_RESULT_CHARS)}…`
          : output}
      </Text>
    </View>
  )
}

/** One request: a tool call and its result rendered together as a single
 *  expandable line. `defaultExpanded` lets the group toggle open every line. */
function ToolLine({
  pair,
  defaultExpanded,
  diffLineLimit,
  onOpenFile
}: {
  pair: ToolPair
  defaultExpanded: boolean
  diffLineLimit: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { call, result } = pair
  const name = call ? call.name : 'Result'
  const preview = call
    ? summarizeToolInput(call.input)
    : (result?.output.split('\n')[0]?.slice(0, 80) ?? '')
  // Why: collapsed tool rows are the common path; defer bounded diff parsing
  // until the user asks to reveal the detail.
  const callDiff = expanded && call ? diffFromToolCall(call.name, call.input, diffLineLimit) : null
  const resultDiff = expanded && result ? diffFromText(result.output, diffLineLimit) : null
  const hasDetail = callDiff !== null || result !== undefined || preview.length > 40
  // A tool that targets a file (Read/Edit/Write…) renders its preview as a
  // tappable link that opens the file, independent of the line's expand tap.
  const filePath = call ? toolFilePath(call.input) : null
  const openable = filePath !== null && onOpenFile !== undefined
  return (
    <View>
      <Pressable
        className="flex-row items-center gap-2 py-[3px]"
        onPress={() => hasDetail && setExpanded((v) => !v)}
        hitSlop={6}
      >
        {expanded ? (
          <ChevronDown size={15} colorClassName="accent-muted-foreground" />
        ) : (
          <SquareChevronRight size={15} colorClassName="accent-muted-foreground" />
        )}
        <Text className="text-foreground font-mono text-xs font-semibold">{name}</Text>
        {preview ? (
          <Text
            className={cn(styles.toolPreview, openable && 'text-primary underline')}
            numberOfLines={1}
            onPress={openable ? () => onOpenFile!(filePath!) : undefined}
            suppressHighlighting={!openable}
          >
            {preview}
          </Text>
        ) : null}
      </Pressable>
      {expanded ? (
        <View className="gap-1 pb-1 pl-4">
          {callDiff ? <DiffView lines={callDiff} /> : null}
          {!callDiff && call && preview ? <Text className={styles.mono}>{preview}</Text> : null}
          {result ? (
            <ResultBody output={result.output} isError={result.isError} diff={resultDiff} />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

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
  if (isTextBlock(block)) {
    // Inverted (user) bubbles use a fixed dark-on-light text rather than the
    // markdown renderer's light-on-dark palette.
    if (invert) {
      return (
        <Text
          className="text-primary-foreground text-sm leading-[23px] font-medium"
          style={[{ fontSize: TEXT_SIZE * fontScale }]}
        >
          {block.text}
        </Text>
      )
    }
    return (
      <MobileMarkdown content={block.text} textScale={1.25 * fontScale} onOpenFile={onOpenFile} />
    )
  }
  if (isImageRefBlock(block)) {
    return (
      <Text className="text-muted-foreground text-sm" style={[{ fontSize: TEXT_SIZE * fontScale }]}>
        🖼 {block.alt ?? block.path ?? block.url ?? 'image'}
      </Text>
    )
  }
  return null
}

/** A run of a message's tool calls/results, collapsed to a one-line summary that
 *  expands to the individual inline tool lines. `defaultExpanded` lets the global
 *  toolbar toggle drive every run at once while still allowing per-run override. */
function ToolRun({
  blocks,
  defaultExpanded,
  trailing,
  onOpenFile
}: {
  blocks: NativeChatBlock[]
  defaultExpanded: boolean
  trailing?: React.ReactNode
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultExpanded)
  const pairs = pairToolBlocks(blocks, MAX_VISIBLE_TOOL_PAIRS)
  const diffLineLimit = Math.max(1, Math.floor(MAX_TOOL_RUN_DIFF_ROWS / (pairs.length * 2 || 1)))
  let callCount = 0
  for (const block of blocks) {
    if (block.type === 'tool-call') {
      callCount++
    }
  }
  callCount ||= pairs.length
  const summary = summarizeToolRun(blocks)
  return (
    <View className="mt-1">
      <View className="flex-row items-center gap-2">
        <Pressable
          className="flex-1 flex-row items-center gap-2 py-[3px]"
          onPress={() => setOpen((v) => !v)}
          hitSlop={6}
        >
          {open ? (
            <ChevronDown size={15} colorClassName="accent-muted-foreground" />
          ) : (
            <SquareChevronRight size={15} colorClassName="accent-muted-foreground" />
          )}
          <Text className="font-mono text-xs font-bold text-green-500">{callCount}×</Text>
          <Text className="text-muted-foreground/60 flex-1 font-mono text-xs" numberOfLines={1}>
            {summary || `${callCount} tool ${callCount === 1 ? 'call' : 'calls'}`}
          </Text>
        </Pressable>
        {trailing}
      </View>
      {open ? (
        <View className="border-l-border mt-1 border-l-2 pl-2">
          {pairs.map((pair, i) => (
            <ToolLine
              key={i}
              pair={pair}
              defaultExpanded={defaultExpanded}
              diffLineLimit={diffLineLimit}
              onOpenFile={onOpenFile}
            />
          ))}
          {callCount > pairs.length ? (
            <Text className={styles.toolPreview}>… {callCount - pairs.length} more tool calls</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/** Subtle top-right controls for an agent message: copy its prose, or scroll so
 *  this message's top aligns to the top of the viewport. */
function AgentControls({
  onCopy,
  onScrollToTop
}: {
  onCopy: () => void
  onScrollToTop?: () => void
}): React.JSX.Element {
  return (
    <View className="mb-[2px] flex-row justify-end gap-1 opacity-[0.7]">
      <Pressable
        className={cn(styles.controlButton, styles.controlPressedActive)}
        onPress={onCopy}
        hitSlop={8}
        accessibilityLabel="Copy message"
      >
        <Copy size={14} colorClassName="accent-muted-foreground" />
      </Pressable>
      {onScrollToTop ? (
        <Pressable
          className={cn(styles.controlButton, styles.controlPressedActive)}
          onPress={onScrollToTop}
          hitSlop={8}
          accessibilityLabel="Scroll this message to top"
        >
          <ArrowUp size={14} colorClassName="accent-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  )
}

function MobileNativeChatMessageImpl({
  message,
  queued,
  toolsExpanded = false,
  fontScale = 1,
  messageIndex,
  onScrollToMessage,
  onOpenFile
}: {
  message: NativeChatMessage
  queued?: boolean
  toolsExpanded?: boolean
  /** Multiplies all chat text sizes for pinch-to-zoom (1 = no change). */
  fontScale?: number
  /** This message's index in the list, paired with onScrollToMessage. */
  messageIndex?: number
  /** Ask the list to align this message's top to the top of the viewport. */
  onScrollToMessage?: (index: number) => void
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
  // Separate the agent's words from its tool activity: prose renders first, the
  // tool calls fold into a collapsible run beneath. The user's own messages get
  // an inverted (filled accent) bubble so they stand apart from agent prose.
  const { prose, tools } = splitNativeChatBlocks(message.blocks)

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

  // Copy + scroll-to-top, shown inline with the first tool call (or after the
  // prose when there are no tools).
  const controls =
    isAgent && !queued ? (
      <AgentControls
        onCopy={handleCopy}
        onScrollToTop={
          onScrollToMessage && messageIndex !== undefined
            ? () => onScrollToMessage(messageIndex)
            : undefined
        }
      />
    ) : null

  return (
    <View className={cn('px-4 py-2', isUser && 'items-end')}>
      {isUser && queued ? (
        <Text className="text-muted-foreground/60 mb-[2px] text-[11px] font-semibold">Queued</Text>
      ) : null}
      <View
        className={cn(
          'max-w-full gap-2',
          isUser && 'max-w-[88%] rounded-2xl bg-primary px-3 py-2',
          isReasoning && 'opacity-[0.7]',
          queued && 'opacity-[0.55]',
          copied && 'bg-[var(--editor-diff-inserted-line-background)]'
        )}
      >
        {prose.map((block, index) => (
          <Prose
            key={index}
            block={block}
            invert={isUser}
            fontScale={fontScale}
            onOpenFile={onOpenFile}
          />
        ))}
        {tools.length > 0 ? (
          <ToolRun
            // Why: a global toggle intentionally resets all per-run/per-line
            // overrides in one remount, avoiding an effect-driven second render.
            key={toolsExpanded ? 'expanded' : 'collapsed'}
            blocks={tools}
            defaultExpanded={toolsExpanded}
            trailing={controls}
            onOpenFile={onOpenFile}
          />
        ) : controls ? (
          <View className="flex-row justify-end">{controls}</View>
        ) : null}
      </View>
    </View>
  )
}

export const MobileNativeChatMessage = memo(MobileNativeChatMessageImpl)
