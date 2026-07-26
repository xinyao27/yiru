import { useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { typography } from '../../theme/uniwind-theme-values'
import {
  parseInline,
  parseMarkdownBlocks,
  type CellAlign,
  type InlineToken,
  type MarkdownBlock
} from './markdown-blocks'
import { isAllowedMarkdownLinkUrl } from './markdown-link-scheme'
import { MermaidDiagram } from './mermaid-diagram'

type Props = {
  content: string
  // PR body uses a slightly larger base than inline comment cards (mirrors desktop).
  variant?: 'document' | 'comment'
}

// Themed, dependency-free markdown for PR bodies + comments — the RN analogue of
// the desktop CommentMarkdown. The previous third-party renderer hung the JS thread
// on mount; this renders a small block model and falls back to plain text on any
// parse error, so it can never crash the comment list.
export function CommentMarkdown({ content, variant = 'comment' }: Props) {
  const base = variant === 'document' ? typography.bodySize : 13
  const blocks = useMemo<MarkdownBlock[] | null>(() => {
    try {
      return parseMarkdownBlocks(content)
    } catch {
      return null
    }
  }, [content])

  if (!blocks) {
    return (
      <Text className={styles.paragraph} style={[{ fontSize: base, lineHeight: base + 7 }]}>
        {content}
      </Text>
    )
  }

  return (
    <View>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} base={base} />
      ))}
    </View>
  )
}

function DetailsBlock({
  summary,
  body,
  base
}: {
  summary: string
  body: MarkdownBlock[]
  base: number
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <View className="border-hairline border-border mb-2 overflow-hidden">
      <Pressable
        className="bg-secondary flex-row items-center gap-1 px-2 py-1"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Chevron size={14} colorClassName="accent-muted-foreground" />
        <Text className="text-foreground shrink font-semibold" style={[{ fontSize: base }]}>
          {summary}
        </Text>
      </Pressable>
      {open ? (
        <View className="px-2 pt-1">
          {body.map((b, i) => (
            <BlockView key={i} block={b} base={base} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function BlockView({ block, base }: { block: MarkdownBlock; base: number }) {
  switch (block.kind) {
    case 'details':
      return <DetailsBlock summary={block.summary} body={block.body} base={base} />
    case 'heading':
      return (
        <Text
          className="text-foreground mb-1 font-bold"
          style={[{ fontSize: base + Math.max(0, 4 - block.level) }]}
        >
          <Inline text={block.text} base={base} />
        </Text>
      )
    case 'code':
      // Mermaid fences render as diagrams (WebView), not as raw code.
      if (block.lang === 'mermaid') {
        return <MermaidDiagram source={block.text} base={base} />
      }
      return (
        <View className="bg-secondary border-hairline border-border mb-2 p-2">
          <Text className="text-foreground font-mono" style={[{ fontSize: base - 1 }]}>
            {block.text}
          </Text>
        </View>
      )
    case 'table':
      return <TableBlock block={block} base={base} />
    case 'quote':
      return (
        <View className="border-l-border bg-secondary mb-2 border-l-[3px] px-2 py-1">
          <Text className={styles.paragraph} style={[{ fontSize: base, lineHeight: base + 7 }]}>
            <Inline text={block.text} base={base} />
          </Text>
        </View>
      )
    case 'hr':
      return <View className="bg-border my-2 h-[1px]" />
    case 'list':
      return (
        <View className="mb-2">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-1">
              <Text className="text-muted-foreground" style={[{ fontSize: base }]}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <Text
                className={cn(styles.paragraph, 'flex-1 mb-[2px]')}
                style={[{ fontSize: base, lineHeight: base + 7 }]}
              >
                <Inline text={item} base={base} />
              </Text>
            </View>
          ))}
        </View>
      )
    case 'paragraph':
      return (
        <Text className={styles.paragraph} style={[{ fontSize: base, lineHeight: base + 7 }]}>
          <Inline text={block.text} base={base} />
        </Text>
      )
  }
}

function openMarkdownLink(url: string): void {
  if (!isAllowedMarkdownLinkUrl(url)) {
    return
  }
  void Linking.openURL(url).catch(() => {})
}

function alignToFlex(align: CellAlign | undefined): 'flex-start' | 'center' | 'flex-end' {
  if (align === 'center') {
    return 'center'
  }
  if (align === 'right') {
    return 'flex-end'
  }
  return 'flex-start'
}

// GFM table rendered with Views. A horizontal ScrollView keeps wide tables from
// breaking the sidebar layout; fixed-width columns give cells room to sit side by side.
function TableBlock({
  block,
  base
}: {
  block: Extract<MarkdownBlock, { kind: 'table' }>
  base: number
}) {
  const columnCount = Math.max(block.headers.length, ...block.rows.map((r) => r.length), 1)
  const columns = Array.from({ length: columnCount }, (_, c) => c)
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-2"
      contentContainerClassName="border-hairline border-border overflow-hidden"
    >
      <View>
        <View className={cn(styles.tableRow, 'border-t-0 bg-secondary')}>
          {columns.map((c) => (
            <View
              key={c}
              className={styles.tableCell}
              style={[{ alignItems: alignToFlex(block.align[c]) }]}
            >
              <Text className="text-foreground font-bold" style={[{ fontSize: base - 1 }]}>
                <Inline text={block.headers[c] ?? ''} base={base} />
              </Text>
            </View>
          ))}
        </View>
        {block.rows.map((row, r) => (
          <View key={r} className={styles.tableRow}>
            {columns.map((c) => (
              <View
                key={c}
                className={styles.tableCell}
                style={[{ alignItems: alignToFlex(block.align[c]) }]}
              >
                <Text className="text-foreground" style={[{ fontSize: base - 1 }]}>
                  <Inline text={row[c] ?? ''} base={base} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function Inline({ text, base }: { text: string; base: number }) {
  const tokens = useMemo<InlineToken[]>(() => {
    try {
      return parseInline(text)
    } catch {
      return [{ kind: 'text', text }]
    }
  }, [text])
  return (
    <>
      {tokens.map((token, i) => {
        if (token.kind === 'bold') {
          return (
            <Text key={i} className="font-bold">
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'italic') {
          return (
            <Text key={i} className="italic">
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'code') {
          return (
            <Text
              key={i}
              className="text-foreground bg-secondary font-mono"
              style={[{ fontSize: base - 1 }]}
            >
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'link') {
          return (
            <Text
              key={i}
              className="text-foreground underline"
              onPress={() => openMarkdownLink(token.url)}
            >
              {token.text}
            </Text>
          )
        }
        return <Text key={i}>{token.text}</Text>
      })}
    </>
  )
}

const styles = {
  paragraph: cn('text-foreground mb-2'),
  tableRow: cn('flex-row border-t-hairline border-t-border'),
  tableCell: cn('min-w-24 px-2 py-1 border-l-hairline border-l-border')
} as const
