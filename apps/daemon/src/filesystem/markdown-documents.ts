import { readdir } from 'node:fs/promises'
import { basename as pathBasename, extname, isAbsolute, join, relative, resolve } from 'node:path'

import type { MarkdownDocument } from '@yiru/runtime-protocol/workbench/types'

function normalizeRelativePath(path: string): string {
  return path.replace(/[\\/]+/g, '/').replace(/^\/+/, '')
}

export function isMarkdownDocumentName(name: string): boolean {
  const extension = extname(name).toLowerCase()
  return extension === '.md' || extension === '.mdx' || extension === '.markdown'
}

function hasParentTraversalSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).includes('..')
}

function rootRelativePath(rootPath: string, filePath: string): string | null {
  const resolvedRoot = resolve(rootPath)
  const resolvedFile = resolve(filePath)
  const relativePath = relative(resolvedRoot, resolvedFile)
  if (hasParentTraversalSegment(relativePath) || isAbsolute(relativePath)) {
    return null
  }
  return normalizeRelativePath(relativePath)
}

export function markdownDocumentFromFilePath(
  rootPath: string,
  filePath: string,
  options: { outsideRootRelativePath?: 'basename' | 'relative' } = {}
): MarkdownDocument {
  const basename = pathBasename(filePath)
  const extension = extname(basename)
  const relativePath =
    rootRelativePath(rootPath, filePath) ??
    (options.outsideRootRelativePath === 'basename'
      ? basename
      : normalizeRelativePath(relative(rootPath, filePath)))
  return {
    filePath,
    relativePath,
    basename,
    name: extension ? basename.slice(0, -extension.length) : basename
  }
}

export async function listMarkdownDocuments(rootPath: string): Promise<MarkdownDocument[]> {
  const documents: MarkdownDocument[] = []

  async function visitDirectory(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue
      }

      const entryPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue
        }
        if (entry.name.startsWith('.') && entry.name !== '.github') {
          continue
        }
        await visitDirectory(entryPath)
        continue
      }

      if (entry.isFile() && isMarkdownDocumentName(entry.name)) {
        documents.push(markdownDocumentFromFilePath(rootPath, entryPath))
      }
    }
  }

  await visitDirectory(rootPath)
  return documents.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
