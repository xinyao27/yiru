import * as monaco from 'monaco-editor'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'

import type { LspCodeAction, LspCommand, LspWorkspaceEdit } from './language-server-protocol'
import { languageServerWorkspaceEditController } from './language-server-workspace-edit-controller'
import { createLanguageServerWorkspaceEditPlan } from './language-server-workspace-edit-plan'
import { toLspPosition, toMonacoRange } from './monaco-language-server-conversions'
import {
  getCodeActionDiagnostics,
  isLspCommand,
  toLspRange,
  validateFormattingEdits,
  wordRenameLocation,
  workspaceEditFromAllowlistedCommand
} from './monaco-language-server-edit-conversions'
import type { MonacoLanguageServerSession } from './monaco-language-server-session'

const APPLY_CODE_ACTION_COMMAND = 'yiru.languageServer.applyCodeAction'
const MAX_CODE_ACTIONS = 100

type EditFeatureRoute = {
  session: MonacoLanguageServerSession
  documentUri: string
}

type CodeActionCommandPayload = {
  session: MonacoLanguageServerSession
  edit: LspWorkspaceEdit
  title: string
}

export class MonacoLanguageServerEditFeatures {
  constructor(
    private readonly getRoute: (model: monaco.editor.ITextModel) => EditFeatureRoute | null
  ) {
    monaco.editor.registerCommand(
      APPLY_CODE_ACTION_COMMAND,
      (_accessor, payload: CodeActionCommandPayload) => void this.applyCodeAction(payload)
    )
  }

  register(languageId: string, codeActionKinds: string[]): monaco.IDisposable[] {
    return [
      monaco.languages.registerRenameProvider(languageId, this.renameProvider()),
      monaco.languages.registerCodeActionProvider(
        languageId,
        this.codeActionProvider(),
        codeActionKinds.length > 0 ? { providedCodeActionKinds: codeActionKinds } : undefined
      ),
      monaco.languages.registerDocumentFormattingEditProvider(
        languageId,
        this.documentFormattingProvider()
      ),
      monaco.languages.registerDocumentRangeFormattingEditProvider(
        languageId,
        this.rangeFormattingProvider()
      )
    ]
  }

  private renameProvider(): monaco.languages.RenameProvider {
    return {
      resolveRenameLocation: async (model, position, token) => {
        const route = this.getRoute(model)
        if (!route?.session.features.supportsRename()) {
          return null
        }
        if (!route.session.features.supportsPrepareRename()) {
          return wordRenameLocation(model, position)
        }
        const result = await route.session.features.prepareRename(
          route.documentUri,
          toLspPosition(position),
          token
        )
        if (!result) {
          return null
        }
        if ('defaultBehavior' in result) {
          return wordRenameLocation(model, position)
        }
        const range = 'range' in result ? result.range : result
        return {
          range: toMonacoRange(range),
          text:
            'placeholder' in result && result.placeholder
              ? result.placeholder
              : model.getValueInRange(toMonacoRange(range))
        }
      },
      provideRenameEdits: async (model, position, newName, token) => {
        const route = this.getRoute(model)
        if (!route?.session.features.supportsRename()) {
          return { edits: [] }
        }
        try {
          const edit = await route.session.features.rename(
            route.documentUri,
            toLspPosition(position),
            newName,
            token
          )
          if (!edit) {
            return {
              edits: [],
              rejectReason: translate(
                'auto.lib.MonacoLanguageServerEditFeatures.noRenameEdits',
                'The language server returned no rename edits.'
              )
            }
          }
          const title = translate(
            'auto.lib.MonacoLanguageServerEditFeatures.renameTitle',
            'Rename symbol to “{{value0}}”',
            { value0: newName }
          )
          await this.previewAndApply(route.session, edit, title)
          // Why: Yiru has either applied or cancelled the authorized plan; null
          // exits Monaco's lifecycle without replaying the raw server edit.
          return null
        } catch (error) {
          return { edits: [], rejectReason: errorMessage(error) }
        }
      }
    }
  }

  private codeActionProvider(): monaco.languages.CodeActionProvider {
    return {
      provideCodeActions: async (model, range, context, token) => {
        const route = this.getRoute(model)
        if (!route?.session.features.supportsCodeActions()) {
          return { actions: [], dispose: () => {} }
        }
        const requestRange = toLspRange(range)
        const diagnostics = getCodeActionDiagnostics(
          route.session,
          route.documentUri,
          model.getVersionId(),
          requestRange,
          context.markers
        )
        try {
          const result = await route.session.features.codeActions(
            route.documentUri,
            requestRange,
            diagnostics,
            context.only,
            context.trigger,
            token
          )
          const actions = (Array.isArray(result) ? result : [])
            .slice(0, MAX_CODE_ACTIONS)
            .flatMap((action) => this.toMonacoCodeAction(route.session, action))
          return { actions, dispose: () => {} }
        } catch {
          return { actions: [], dispose: () => {} }
        }
      }
    }
  }

  private toMonacoCodeAction(
    session: MonacoLanguageServerSession,
    action: LspCodeAction | LspCommand
  ): monaco.languages.CodeAction[] {
    if (typeof action.title !== 'string') {
      return []
    }
    const title = action.title.slice(0, 500)
    const codeAction = isLspCommand(action) ? null : action
    const commandEdit = workspaceEditFromAllowlistedCommand(action)
    const edit = codeAction?.edit ?? commandEdit
    if (!edit) {
      return []
    }
    const hasUnsupportedCommand = Boolean(codeAction?.command && !commandEdit)
    const disabled = hasUnsupportedCommand
      ? translate(
          'auto.lib.MonacoLanguageServerEditFeatures.commandDisabled',
          'Language server commands are not allowed.'
        )
      : codeAction?.disabled?.reason
    return [
      {
        title,
        kind: codeAction?.kind,
        isPreferred: codeAction?.isPreferred,
        disabled,
        ...(!disabled
          ? {
              command: {
                id: APPLY_CODE_ACTION_COMMAND,
                title,
                arguments: [{ session, edit, title }]
              }
            }
          : {})
      }
    ]
  }

  private documentFormattingProvider(): monaco.languages.DocumentFormattingEditProvider {
    return {
      provideDocumentFormattingEdits: async (model, options, token) => {
        const route = this.getRoute(model)
        if (!route?.session.features.supportsDocumentFormatting()) {
          return null
        }
        const edits = await route.session.features.formatting(
          route.documentUri,
          null,
          options,
          token
        )
        return validateFormattingEdits(model, edits)
      }
    }
  }

  private rangeFormattingProvider(): monaco.languages.DocumentRangeFormattingEditProvider {
    return {
      provideDocumentRangeFormattingEdits: async (model, range, options, token) => {
        const route = this.getRoute(model)
        if (!route?.session.features.supportsRangeFormatting()) {
          return null
        }
        const edits = await route.session.features.formatting(
          route.documentUri,
          toLspRange(range),
          options,
          token
        )
        return validateFormattingEdits(model, edits)
      }
    }
  }

  private async applyCodeAction(payload: CodeActionCommandPayload): Promise<void> {
    try {
      await this.previewAndApply(payload.session, payload.edit, payload.title)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  private async previewAndApply(
    session: MonacoLanguageServerSession,
    edit: LspWorkspaceEdit,
    title: string
  ): Promise<void> {
    const plan = await createLanguageServerWorkspaceEditPlan(session, edit, title)
    await languageServerWorkspaceEditController.submit(plan)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
