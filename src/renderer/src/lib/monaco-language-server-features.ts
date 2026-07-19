import * as monaco from 'monaco-editor'
import type { Disposable } from 'vscode-jsonrpc/browser'
import type { LspLocation, LspRange } from './language-server-protocol'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'
import {
  normalizeDefinitions,
  toLspPosition,
  toMonacoHover,
  toMonacoRange
} from './monaco-language-server-conversions'
import { toMonacoCompletionList, toMonacoSignatureHelp } from './monaco-language-server-suggestions'
import { toMonacoDocumentSymbols } from './monaco-language-server-symbols'
import { MonacoLanguageServerEditFeatures } from './monaco-language-server-edit-features'

const MAX_LOCATIONS = 1_000

type ModelRoute = {
  session: MonacoLanguageServerSession
  uri: string
}

type LanguageRegistration = {
  completionTriggers: Set<string>
  signatureTriggers: Set<string>
  signatureRetriggers: Set<string>
  codeActionKinds: Set<string>
  disposables: Disposable[]
}

export class MonacoLanguageServerFeatures {
  private readonly registrations = new Map<string, LanguageRegistration>()
  private readonly editFeatures: MonacoLanguageServerEditFeatures

  constructor(private readonly getRoute: (model: monaco.editor.ITextModel) => ModelRoute | null) {
    this.editFeatures = new MonacoLanguageServerEditFeatures((model) => {
      const route = this.getRoute(model)
      return route ? { session: route.session, documentUri: route.uri } : null
    })
  }

  ensureLanguage(languageId: string, session: MonacoLanguageServerSession): void {
    const registration = this.registrations.get(languageId) ?? createLanguageRegistration()
    const signatureTriggers = session.features.getSignatureTriggerCharacters()
    let changed = addAll(
      registration.completionTriggers,
      session.features.getCompletionTriggerCharacters()
    )
    changed = addAll(registration.signatureTriggers, signatureTriggers.trigger) || changed
    changed = addAll(registration.signatureRetriggers, signatureTriggers.retrigger) || changed
    changed = addAll(registration.codeActionKinds, session.features.getCodeActionKinds()) || changed
    if (!this.registrations.has(languageId) || changed) {
      for (const disposable of registration.disposables.splice(0)) {
        disposable.dispose()
      }
      registration.disposables = this.register(languageId, registration)
      this.registrations.set(languageId, registration)
    }
  }

  private register(languageId: string, registration: LanguageRegistration): Disposable[] {
    return [
      monaco.languages.registerHoverProvider(languageId, {
        provideHover: async (model, position, token) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsHover()) {
            return null
          }
          try {
            return toMonacoHover(
              await route.session.features.hover(route.uri, toLspPosition(position), token)
            )
          } catch {
            return null
          }
        }
      }),
      monaco.languages.registerDefinitionProvider(languageId, {
        provideDefinition: async (model, position, token) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsDefinition()) {
            return null
          }
          try {
            const definitions = normalizeDefinitions(
              await route.session.features.definition(route.uri, toLspPosition(position), token)
            )
            return resolveLocations(route.session, definitions)
          } catch {
            return null
          }
        }
      }),
      monaco.languages.registerCompletionItemProvider(languageId, {
        triggerCharacters: [...registration.completionTriggers],
        provideCompletionItems: async (model, position, context, token) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsCompletion()) {
            return { suggestions: [] }
          }
          if (
            context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter &&
            (!context.triggerCharacter ||
              !route.session.features
                .getCompletionTriggerCharacters()
                .includes(context.triggerCharacter))
          ) {
            return { suggestions: [] }
          }
          try {
            const result = await route.session.features.completion(
              route.uri,
              toLspPosition(position),
              {
                triggerKind: toLspCompletionTriggerKind(context.triggerKind),
                triggerCharacter: context.triggerCharacter
              },
              token
            )
            return toMonacoCompletionList(result, model, position)
          } catch {
            return { suggestions: [] }
          }
        }
      }),
      monaco.languages.registerSignatureHelpProvider(languageId, {
        signatureHelpTriggerCharacters: [...registration.signatureTriggers],
        signatureHelpRetriggerCharacters: [...registration.signatureRetriggers],
        provideSignatureHelp: async (model, position, token, context) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsSignatureHelp()) {
            return null
          }
          if (context.triggerKind === monaco.languages.SignatureHelpTriggerKind.TriggerCharacter) {
            const triggers = route.session.features.getSignatureTriggerCharacters()
            if (
              !context.triggerCharacter ||
              ![...triggers.trigger, ...triggers.retrigger].includes(context.triggerCharacter)
            ) {
              return null
            }
          }
          try {
            const help = toMonacoSignatureHelp(
              await route.session.features.signatureHelp(
                route.uri,
                toLspPosition(position),
                {
                  triggerKind: context.triggerKind,
                  triggerCharacter: context.triggerCharacter,
                  isRetrigger: context.isRetrigger
                },
                token
              )
            )
            return help ? { value: help, dispose: () => {} } : null
          } catch {
            return null
          }
        }
      }),
      monaco.languages.registerReferenceProvider(languageId, {
        provideReferences: async (model, position, context, token) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsReferences()) {
            return null
          }
          try {
            const locations = await route.session.features.references(
              route.uri,
              toLspPosition(position),
              context.includeDeclaration,
              token
            )
            return resolveLocations(route.session, locations ?? [])
          } catch {
            return null
          }
        }
      }),
      monaco.languages.registerDocumentSymbolProvider(languageId, {
        displayName: 'Yiru Language Server',
        provideDocumentSymbols: async (model, token) => {
          const route = this.getRoute(model)
          if (!route?.session.features.supportsDocumentSymbols()) {
            return []
          }
          try {
            return toMonacoDocumentSymbols(
              await route.session.features.documentSymbols(route.uri, token),
              model,
              route.uri
            )
          } catch {
            return []
          }
        }
      }),
      ...this.editFeatures.register(languageId, [...registration.codeActionKinds])
    ]
  }
}

async function resolveLocations(
  session: MonacoLanguageServerSession,
  locations: { uri: string; range: LspRange }[] | LspLocation[]
): Promise<monaco.languages.Location[]> {
  const resolved = await Promise.allSettled(
    locations.slice(0, MAX_LOCATIONS).map(async (entry) => ({
      target: await session.resolveLocation(entry.uri),
      range: entry.range
    }))
  )
  return resolved.flatMap((result) =>
    result.status === 'fulfilled'
      ? [
          {
            uri: monaco.Uri.file(result.value.target.filePath),
            range: toMonacoRange(result.value.range)
          }
        ]
      : []
  )
}

function createLanguageRegistration(): LanguageRegistration {
  return {
    completionTriggers: new Set(),
    signatureTriggers: new Set(),
    signatureRetriggers: new Set(),
    codeActionKinds: new Set(),
    disposables: []
  }
}

function addAll(target: Set<string>, values: string[]): boolean {
  let changed = false
  for (const value of values) {
    if (typeof value === 'string' && value.length === 1 && !target.has(value)) {
      target.add(value)
      changed = true
    }
  }
  return changed
}

function toLspCompletionTriggerKind(kind: monaco.languages.CompletionTriggerKind): number {
  if (kind === monaco.languages.CompletionTriggerKind.TriggerCharacter) {
    return 2
  }
  if (kind === monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions) {
    return 3
  }
  return 1
}
