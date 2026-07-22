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
    <View className={styles.details}>
      <Pressable
        className={styles.detailsSummary}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Chevron size={14} colorClassName="accent-muted-foreground" />
        <Text className={styles.detailsSummaryText} style={[{ fontSize: base }]}>
          {summary}
        </Text>
      </Pressable>
      {open ? (
        <View className={styles.detailsBody}>
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
          className={styles.heading}
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
        <View className={styles.codeBlock}>
          <Text className={styles.codeText} style={[{ fontSize: base - 1 }]}>
            {block.text}
          </Text>
        </View>
      )
    case 'table':
      return <TableBlock block={block} base={base} />
    case 'quote':
      return (
        <View className={styles.quote}>
          <Text className={styles.paragraph} style={[{ fontSize: base, lineHeight: base + 7 }]}>
            <Inline text={block.text} base={base} />
          </Text>
        </View>
      )
    case 'hr':
      return <View className={styles.hr} />
    case 'list':
      return (
        <View className={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} className={styles.listItem}>
              <Text className={styles.bullet} style={[{ fontSize: base }]}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <Text
                className={cn(styles.paragraph, styles.listItemText)}
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
      className={styles.tableScroll}
      contentContainerClassName={styles.table}
    >
      <View>
        <View className={cn(styles.tableRow, styles.tableHeaderRow)}>
          {columns.map((c) => (
            <View
              key={c}
              className={styles.tableCell}
              style={[{ alignItems: alignToFlex(block.align[c]) }]}
            >
              <Text className={styles.tableHeaderText} style={[{ fontSize: base - 1 }]}>
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
                <Text className={styles.tableCellText} style={[{ fontSize: base - 1 }]}>
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
            <Text key={i} className={styles.bold}>
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'italic') {
          return (
            <Text key={i} className={styles.italic}>
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'code') {
          return (
            <Text key={i} className={styles.codeInline} style={[{ fontSize: base - 1 }]}>
              {token.text}
            </Text>
          )
        }
        if (token.kind === 'link') {
          return (
            <Text key={i} className={styles.link} onPress={() => openMarkdownLink(token.url)}>
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
  heading: cn('text-foreground font-bold mb-1'),
  bold: cn('font-bold'),
  italic: cn('italic'),
  link: cn('text-foreground underline'),
  codeInline: cn('text-foreground font-mono bg-secondary'),
  codeBlock: cn('bg-secondary border-hairline border-border rounded-none p-2 mb-2'),
  codeText: cn('text-foreground font-mono'),
  quote: cn('border-l-[3px] border-l-border bg-secondary px-2 py-1 mb-2'),
  hr: cn('h-[1px] bg-border my-2'),
  list: cn('mb-2'),
  listItem: cn('flex-row gap-1'),
  listItemText: cn('flex-1 mb-[2px]'),
  bullet: cn('text-muted-foreground'),
  details: cn('border-hairline border-border rounded-none mb-2 overflow-hidden'),
  detailsSummary: cn('flex-row items-center gap-1 px-2 py-1 bg-secondary'),
  detailsSummaryText: cn('text-foreground font-semibold shrink'),
  detailsBody: cn('px-2 pt-1'),
  tableScroll: cn('mb-2'),
  table: cn('border-hairline border-border rounded-none overflow-hidden'),
  tableRow: cn('flex-row border-t-hairline border-t-border'),
  tableHeaderRow: cn('border-t-0 bg-secondary'),
  tableCell: cn('min-w-24 px-2 py-1 border-l-hairline border-l-border'),
  tableHeaderText: cn('text-foreground font-bold'),
  tableCellText: cn('text-foreground')
} as const
