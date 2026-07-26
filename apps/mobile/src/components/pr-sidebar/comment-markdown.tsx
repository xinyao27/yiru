import { useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

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
  variant?: 'document' | 'comment'
}

type CommentMarkdownVariant = NonNullable<Props['variant']>

function bodyTextClassName(variant: CommentMarkdownVariant): string {
  return variant === 'document' ? 'text-base' : 'text-sm'
}

function codeTextClassName(variant: CommentMarkdownVariant): string {
  return variant === 'document' ? 'text-sm' : 'text-xs'
}

function headingTextClassName(level: number, variant: CommentMarkdownVariant): string {
  if (level === 1) {
    return variant === 'document' ? 'text-xl' : 'text-lg'
  }
  if (level === 2) {
    return variant === 'document' ? 'text-lg' : 'text-base'
  }
  return bodyTextClassName(variant)
}

// Themed, dependency-free markdown for PR bodies + comments — the RN analogue of
// the desktop CommentMarkdown. The previous third-party renderer hung the JS thread
// on mount; this renders a small block model and falls back to plain text on any
// parse error, so it can never crash the comment list.
export function CommentMarkdown({ content, variant = 'comment' }: Props) {
  const blocks = useMemo<MarkdownBlock[] | null>(() => {
    try {
      return parseMarkdownBlocks(content)
    } catch {
      return null
    }
  }, [content])

  if (!blocks) {
    return <Text className={cn(styles.paragraph, bodyTextClassName(variant))}>{content}</Text>
  }

  return (
    <View>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} variant={variant} />
      ))}
    </View>
  )
}

function DetailsBlock({
  summary,
  body,
  variant
}: {
  summary: string
  body: MarkdownBlock[]
  variant: CommentMarkdownVariant
}) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <View className="border-hairline border-border mb-2 overflow-hidden rounded-xl">
      <Pressable
        className="bg-secondary flex-row items-center gap-1 px-2 py-1"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Chevron size={14} colorClassName="accent-muted-foreground" />
        <Text className={cn('text-foreground shrink font-semibold', bodyTextClassName(variant))}>
          {summary}
        </Text>
      </Pressable>
      {open ? (
        <View className="px-2 pt-1">
          {body.map((b, i) => (
            <BlockView key={i} block={b} variant={variant} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function BlockView({ block, variant }: { block: MarkdownBlock; variant: CommentMarkdownVariant }) {
  switch (block.kind) {
    case 'details':
      return <DetailsBlock summary={block.summary} body={block.body} variant={variant} />
    case 'heading':
      return (
        <Text
          className={cn(
            'text-foreground mb-1 font-bold',
            headingTextClassName(block.level, variant)
          )}
        >
          <Inline text={block.text} variant={variant} />
        </Text>
      )
    case 'code':
      // Mermaid fences render as diagrams (WebView), not as raw code.
      if (block.lang === 'mermaid') {
        return <MermaidDiagram source={block.text} codeClassName={codeTextClassName(variant)} />
      }
      return (
        <View className="border-hairline border-border bg-secondary mb-2 rounded-xl p-2">
          <Text className={cn('text-foreground font-mono', codeTextClassName(variant))}>
            {block.text}
          </Text>
        </View>
      )
    case 'table':
      return <TableBlock block={block} variant={variant} />
    case 'quote':
      return (
        <View className="border-l-border bg-secondary mb-2 border-l-2 px-2 py-1">
          <Text className={cn(styles.paragraph, bodyTextClassName(variant))}>
            <Inline text={block.text} variant={variant} />
          </Text>
        </View>
      )
    case 'hr':
      return <View className="bg-border my-2 h-px" />
    case 'list':
      return (
        <View className="mb-2">
          {block.items.map((item, i) => (
            <View key={i} className="flex-row gap-1">
              <Text className={cn('text-muted-foreground', bodyTextClassName(variant))}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <Text className={cn(styles.paragraph, 'flex-1 mb-0.5', bodyTextClassName(variant))}>
                <Inline text={item} variant={variant} />
              </Text>
            </View>
          ))}
        </View>
      )
    case 'paragraph':
      return (
        <Text className={cn(styles.paragraph, bodyTextClassName(variant))}>
          <Inline text={block.text} variant={variant} />
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
  variant
}: {
  block: Extract<MarkdownBlock, { kind: 'table' }>
  variant: CommentMarkdownVariant
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
              <Text className={cn('text-foreground font-bold', codeTextClassName(variant))}>
                <Inline text={block.headers[c] ?? ''} variant={variant} />
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
                <Text className={cn('text-foreground', codeTextClassName(variant))}>
                  <Inline text={row[c] ?? ''} variant={variant} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function Inline({ text, variant }: { text: string; variant: CommentMarkdownVariant }) {
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
              className={cn(
                'text-foreground bg-secondary rounded font-mono',
                codeTextClassName(variant)
              )}
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
