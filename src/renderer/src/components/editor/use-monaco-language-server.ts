import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { toast } from 'sonner'
import type { LanguageServerSettings } from '../../../../shared/language-server'
import { monacoLanguageServerManager } from '@/lib/monaco-language-server-manager'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { openEditorNavigationTarget } from './open-editor-navigation-target'

type MonacoLanguageServerOptions = {
  editorInstance: monaco.editor.IStandaloneCodeEditor | null
  filePath: string
  worktreeId?: string
  runtimeEnvironmentId?: string | null
  readOnly: boolean
  settings?: LanguageServerSettings
}

export function useMonacoLanguageServer({
  editorInstance,
  filePath,
  worktreeId,
  runtimeEnvironmentId,
  readOnly,
  settings
}: MonacoLanguageServerOptions): void {
  const definitionContextRef = useRef<monaco.editor.IContextKey<boolean> | null>(null)
  const connectionId = useAppStore((state) =>
    getConnectionIdForFileFromState(state, worktreeId ?? null, filePath)
  )
  const connectionStatus = useAppStore((state) =>
    connectionId ? state.sshConnectionStates.get(connectionId)?.status : null
  )

  useEffect(() => {
    if (!editorInstance || !worktreeId) {
      return
    }
    let definitionRequest: monaco.CancellationTokenSource | null = null
    const definitionContext = editorInstance.createContextKey(
      'yiruLanguageServerDefinitionAttached',
      false
    )
    definitionContextRef.current = definitionContext
    const action = editorInstance.addAction({
      id: 'yiru.lsp.goToDefinition',
      label: translate('auto.components.editor.MonacoEditor.goToDefinition', 'Go to Definition'),
      keybindings: [monaco.KeyCode.F12],
      // Why: preserve Monaco's built-in F12 providers when this model has no
      // active Yiru LSP definition route.
      precondition: 'yiruLanguageServerDefinitionAttached',
      run: async () => {
        const model = editorInstance.getModel()
        const position = editorInstance.getPosition()
        if (!model || !position) {
          return
        }
        definitionRequest?.cancel()
        definitionRequest?.dispose()
        const request = new monaco.CancellationTokenSource()
        definitionRequest = request
        try {
          const target = await monacoLanguageServerManager.findDefinition(
            model,
            position,
            request.token
          )
          if (target && !request.token.isCancellationRequested) {
            openEditorNavigationTarget(worktreeId, runtimeEnvironmentId, target)
          }
        } catch (error) {
          if (!request.token.isCancellationRequested) {
            toast.error(error instanceof Error ? error.message : String(error))
          }
        } finally {
          if (definitionRequest === request) {
            definitionRequest = null
          }
          request.dispose()
        }
      }
    })
    return () => {
      definitionRequest?.cancel()
      definitionRequest?.dispose()
      definitionContext.reset()
      if (definitionContextRef.current === definitionContext) {
        definitionContextRef.current = null
      }
      action.dispose()
    }
  }, [editorInstance, runtimeEnvironmentId, worktreeId])

  useEffect(() => {
    const model = editorInstance?.getModel()
    if (!model || !worktreeId) {
      return
    }
    let disposed = false
    let attachment: { dispose: () => void } | null = null
    definitionContextRef.current?.set(false)
    void monacoLanguageServerManager
      .attachDocument({
        model,
        filePath,
        worktreeId,
        runtimeEnvironmentId,
        connectionId,
        readOnly,
        settings
      })
      .then((nextAttachment) => {
        if (disposed) {
          nextAttachment?.dispose()
        } else {
          attachment = nextAttachment
          definitionContextRef.current?.set(
            nextAttachment !== null && monacoLanguageServerManager.supportsDefinition(model)
          )
        }
      })
      .catch((error) => {
        if (!disposed) {
          toast.error(error instanceof Error ? error.message : String(error), {
            id: `language-server:${worktreeId}`
          })
        }
      })
    return () => {
      disposed = true
      definitionContextRef.current?.set(false)
      attachment?.dispose()
    }
  }, [
    connectionId,
    connectionStatus,
    editorInstance,
    filePath,
    readOnly,
    runtimeEnvironmentId,
    settings,
    worktreeId
  ])
}
