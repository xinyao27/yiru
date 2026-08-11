import { getFiletypeFromFileName } from '@pierre/diffs'

const EDITOR_TO_PIERRE_LANGUAGE: Readonly<Record<string, string>> = {
  notebook: 'json',
  plaintext: 'text',
  systemverilog: 'system-verilog'
}

export function resolvePierreDiffLanguage(filePath: string, editorLanguage: string): string {
  const pathLanguage = getFiletypeFromFileName(filePath)
  if (pathLanguage !== 'text') {
    return pathLanguage
  }
  return EDITOR_TO_PIERRE_LANGUAGE[editorLanguage] ?? editorLanguage
}
