import type { NativeChatBlock } from '@yiru/workbench-model/agent'
import { Pressable, Text, View } from 'react-native'

import { BottomDrawer } from '~/components/bottom-drawer'

import { pairToolBlocks, type ToolPair } from './blocks'
import { MobileNativeChatCodeBlock } from './code-block'
import { diffFromText, diffFromToolCall, type DiffLine } from './diff'
import { withOccurrenceKeys } from './occurrence-keys'
import { formatToolInput, summarizeToolInput, toolFilePath } from './tool-summary'

const MAX_TOOL_RESULT_CHARS = 4000
const MAX_TOOL_RUN_DIFF_ROWS = 240

type ToolDetailsDrawerProps = {
  visible: boolean
  blocks: NativeChatBlock[]
  onClose: () => void
  onOpenFile?: (relativePath: string) => void
}

function formatDiff(lines: DiffLine[]): string {
  return lines
    .map((line) => `${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.text}`)
    .join('\n')
}

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
    return <MobileNativeChatCodeBlock code={formatDiff(diff)} language="diff" />
  }
  const visibleOutput =
    output.length > MAX_TOOL_RESULT_CHARS ? `${output.slice(0, MAX_TOOL_RESULT_CHARS)}…` : output
  return (
    <Text
      className={
        isError ? 'text-destructive text-sm leading-5' : 'text-foreground text-sm leading-5'
      }
      selectable
    >
      {visibleOutput}
    </Text>
  )
}

function ToolDetail({
  pair,
  diffLineLimit,
  onOpenFile
}: {
  pair: ToolPair
  diffLineLimit: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const { call, result } = pair
  const name = call?.name || 'Result'
  const preview = call ? summarizeToolInput(call.input) : ''
  const input = call ? formatToolInput(call.input) : ''
  const callDiff = call ? diffFromToolCall(call.name, call.input, diffLineLimit) : null
  const resultDiff = result ? diffFromText(result.output, diffLineLimit) : null
  const filePath = call ? toolFilePath(call.input) : null
  const canOpenFile = filePath !== null && onOpenFile !== undefined
  const headerText = (
    <View className="min-w-0">
      <Text className="text-foreground text-sm font-semibold">{name}</Text>
      {preview ? (
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {preview}
        </Text>
      ) : null}
    </View>
  )

  return (
    <View className="gap-3 py-3">
      {canOpenFile ? (
        <Pressable
          accessibilityLabel={`Open ${filePath}`}
          accessibilityRole="button"
          className="min-w-0 active:opacity-60"
          hitSlop={8}
          onPress={() => onOpenFile(filePath)}
        >
          {headerText}
        </Pressable>
      ) : (
        headerText
      )}
      {callDiff ? (
        <MobileNativeChatCodeBlock code={formatDiff(callDiff)} language="diff" />
      ) : input ? (
        <MobileNativeChatCodeBlock code={input} language="json" />
      ) : null}
      {result ? (
        <ResultBody output={result.output} isError={result.isError} diff={resultDiff} />
      ) : null}
    </View>
  )
}

function toolPairIdentity(pair: ToolPair): string {
  const call = pair.call
  const result = pair.result
  return [
    call?.name ?? 'result',
    call ? summarizeToolInput(call.input) : '',
    result?.output.slice(0, 80) ?? ''
  ].join(':')
}

export function MobileNativeChatToolDetailsDrawer({
  visible,
  blocks,
  onClose,
  onOpenFile
}: ToolDetailsDrawerProps): React.JSX.Element {
  const pairs = pairToolBlocks(blocks)
  const keyedPairs = withOccurrenceKeys(pairs, toolPairIdentity)
  const diffLineLimit = Math.max(1, Math.floor(MAX_TOOL_RUN_DIFF_ROWS / (pairs.length * 2 || 1)))

  return (
    <BottomDrawer visible={visible} onClose={onClose} dragContentToDismiss={false}>
      <View className="border-b-hairline border-border pb-3">
        <Text className="text-foreground text-base font-semibold">Tool activity</Text>
        <Text className="text-muted-foreground text-sm">
          {pairs.length} {pairs.length === 1 ? 'tool call' : 'tool calls'}
        </Text>
      </View>
      <View>
        {keyedPairs.map(({ key, value: pair }, index) => (
          <View key={key} className={index > 0 ? 'border-t-hairline border-border' : undefined}>
            <ToolDetail pair={pair} diffLineLimit={diffLineLimit} onOpenFile={onOpenFile} />
          </View>
        ))}
      </View>
    </BottomDrawer>
  )
}
