import { buildMarkdownTableOfContents, type MarkdownTocItem } from './markdown-table-of-contents'

// Why: the TOC panel is closed by default, so a single stable empty array lets
// the editor's memo skip the full-document remark parse while keeping a constant
// reference (no spurious downstream renders) until the panel actually opens.
const EMPTY_MARKDOWN_TOC: MarkdownTocItem[] = []

/**
 * Why: building the table of contents runs a full-document remark parse on
 * every content change. The result is only consumed when the TOC panel is open,
 * so gate the parse on visibility.
 */
export function selectMarkdownTableOfContents(
  showTableOfContents: boolean,
  content: string
): MarkdownTocItem[] {
  return showTableOfContents ? buildMarkdownTableOfContents(content) : EMPTY_MARKDOWN_TOC
}
