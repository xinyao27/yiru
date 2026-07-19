import * as monaco from 'monaco-editor'
import { monacoLanguageServerManager } from '@/lib/monaco-language-server-manager'
import type { EditorNavigationTarget } from './open-editor-navigation-target'
import {
  getImportModuleSpecifierAtPosition,
  isRelativeModuleSpecifier,
  type ImportModuleSpecifier
} from './import-module-specifier'
import {
  resolveRelativeImportTarget,
  type RelativeImportContext
} from './relative-import-target-resolution'

export type MonacoImportNavigationContext = RelativeImportContext & {
  openTarget: (target: EditorNavigationTarget) => void
}

export type MonacoImportNavigationController = {
  dispose: () => void
}

type CachedTarget = {
  key: string
  promise: Promise<EditorNavigationTarget | null>
  request: monaco.CancellationTokenSource
}

export function createMonacoImportNavigationController(
  editor: monaco.editor.IStandaloneCodeEditor,
  getContext: () => MonacoImportNavigationContext | null
): MonacoImportNavigationController {
  const decorations = editor.createDecorationsCollection()
  const isMac = navigator.userAgent.includes('Mac')
  let disposed = false
  let modifierDown = false
  let hoveredKey: string | null = null
  let lastHoveredPosition: monaco.Position | null = null
  let cached: CachedTarget | null = null

  const clearDecoration = (): void => {
    hoveredKey = null
    decorations.clear()
  }
  const clearRequest = (): void => {
    cached?.request.cancel()
    cached?.request.dispose()
    cached = null
  }
  const showLinkIfResolvable = (
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    specifier: ImportModuleSpecifier
  ): void => {
    if (!canNavigateSpecifier(model, specifier.value)) {
      clearDecoration()
      return
    }
    const context = getContext()
    if (!context) {
      clearDecoration()
      return
    }
    const key = targetKey(model, specifier, context)
    hoveredKey = key
    void resolveTarget(model, position, specifier, key, context).then((target) => {
      if (disposed || !modifierDown || hoveredKey !== key || !target) {
        return
      }
      decorations.set([
        {
          range: specifier.range,
          options: { inlineClassName: 'monaco-import-navigation-link', stickiness: 1 }
        }
      ])
    })
  }
  const resolveTarget = (
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    specifier: ImportModuleSpecifier,
    key: string,
    context: MonacoImportNavigationContext
  ): Promise<EditorNavigationTarget | null> => {
    if (cached?.key === key) {
      return cached.promise
    }
    clearRequest()
    const request = new monaco.CancellationTokenSource()
    const promise = resolveImportNavigationTarget(
      model,
      position,
      specifier.value,
      context,
      request.token
    )
    cached = { key, promise, request }
    return promise
  }
  const showCurrentHover = (): void => {
    const model = editor.getModel()
    if (!model || !lastHoveredPosition) {
      clearDecoration()
      return
    }
    const specifier = getImportModuleSpecifierAtPosition(model, lastHoveredPosition)
    if (!specifier) {
      clearDecoration()
      return
    }
    showLinkIfResolvable(model, lastHoveredPosition, specifier)
  }
  const handleMouseMove = (event: monaco.editor.IEditorMouseEvent): void => {
    modifierDown = hasNavigationModifier(event.event.browserEvent, isMac)
    lastHoveredPosition = event.target.position ?? null
    if (modifierDown) {
      showCurrentHover()
    } else {
      clearDecoration()
    }
  }
  const handleMouseDown = (event: monaco.editor.IEditorMouseEvent): void => {
    if (!event.event.leftButton || !hasNavigationModifier(event.event.browserEvent, isMac)) {
      return
    }
    const model = editor.getModel()
    const position = event.target.position
    if (!model || !position) {
      return
    }
    const specifier = getImportModuleSpecifierAtPosition(model, position)
    if (!specifier || !canNavigateSpecifier(model, specifier.value)) {
      return
    }
    event.event.preventDefault()
    event.event.stopPropagation()
    const context = getContext()
    if (!context) {
      return
    }
    const key = targetKey(model, specifier, context)
    void resolveTarget(model, position, specifier, key, context).then((target) => {
      if (!disposed && target) {
        context.openTarget(target)
      }
    })
  }
  const handleKeyChange = (event: KeyboardEvent): void => {
    modifierDown = isMac ? event.metaKey : event.ctrlKey
    if (modifierDown) {
      showCurrentHover()
    } else {
      clearDecoration()
    }
  }
  const handleMouseLeave = (): void => {
    lastHoveredPosition = null
    clearDecoration()
  }

  const subscriptions = [
    editor.onMouseMove(handleMouseMove),
    editor.onMouseDown(handleMouseDown),
    editor.onMouseLeave(handleMouseLeave),
    editor.onDidChangeModelContent(() => {
      clearDecoration()
      clearRequest()
    })
  ]
  window.addEventListener('keydown', handleKeyChange, { capture: true })
  window.addEventListener('keyup', handleKeyChange, { capture: true })
  window.addEventListener('blur', clearDecoration)

  return {
    dispose: () => {
      disposed = true
      clearDecoration()
      clearRequest()
      for (const subscription of subscriptions) {
        subscription.dispose()
      }
      window.removeEventListener('keydown', handleKeyChange, { capture: true })
      window.removeEventListener('keyup', handleKeyChange, { capture: true })
      window.removeEventListener('blur', clearDecoration)
    }
  }
}

async function resolveImportNavigationTarget(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  specifier: string,
  context: MonacoImportNavigationContext | null,
  token: monaco.CancellationToken
): Promise<EditorNavigationTarget | null> {
  if (!context) {
    return null
  }
  // Why: keep server-aware aliases/package resolution authoritative, while
  // relative imports still work without requiring a configured language server.
  try {
    const definition = await monacoLanguageServerManager.findDefinition(model, position, token)
    if (definition || token.isCancellationRequested) {
      return definition
    }
  } catch {
    if (token.isCancellationRequested) {
      return null
    }
  }
  return isRelativeModuleSpecifier(specifier)
    ? resolveRelativeImportTarget(context, specifier)
    : null
}

function canNavigateSpecifier(model: monaco.editor.ITextModel, specifier: string): boolean {
  return (
    isRelativeModuleSpecifier(specifier) || monacoLanguageServerManager.supportsDefinition(model)
  )
}

function targetKey(
  model: monaco.editor.ITextModel,
  specifier: ImportModuleSpecifier,
  context: MonacoImportNavigationContext
): string {
  const range = specifier.range
  // Why: identical paths can exist on multiple runtimes; cached definitions
  // must remain scoped to the execution host and owning worktree.
  const owner = context.runtimeEnvironmentId?.trim() || 'client'
  return `${owner}\0${context.worktreeId}\0${context.filePath}\0${model.getVersionId()}\0${range.startLineNumber}:${range.startColumn}:${range.endColumn}`
}

function hasNavigationModifier(event: MouseEvent, isMac: boolean): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}
