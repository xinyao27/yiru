import type * as monaco from 'monaco-editor'

import { normalizeDefinitions, toLspPosition } from './monaco-language-server-conversions'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'

export type LanguageServerNavigationTarget = {
  filePath: string
  relativePath: string
  line: number
  column: number
}

export async function findLanguageServerDefinition(
  route: { session: MonacoLanguageServerSession; uri: string } | null,
  position: monaco.Position,
  token: monaco.CancellationToken
): Promise<LanguageServerNavigationTarget | null> {
  if (!route?.session.features.supportsDefinition()) {
    return null
  }
  const definitions = normalizeDefinitions(
    await route.session.features.definition(route.uri, toLspPosition(position), token)
  )
  for (const definition of definitions) {
    try {
      const location = await route.session.resolveLocation(definition.uri)
      return {
        ...location,
        line: definition.range.start.line + 1,
        column: definition.range.start.character + 1
      }
    } catch {
      // Definitions outside the authorized workspace are skipped, not opened.
    }
  }
  return null
}
