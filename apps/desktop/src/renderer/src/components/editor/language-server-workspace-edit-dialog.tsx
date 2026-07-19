import { FileCode, WarningCircle } from '@phosphor-icons/react'
import React, { Suspense, useEffect, useState, useSyncExternalStore } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { detectLanguage } from '@/lib/language-detect'
import {
  languageServerWorkspaceEditController,
  type LanguageServerWorkspaceEditRequest
} from '@/lib/language-server-workspace-edit-controller'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import { useAppStore } from '@/store'

const DiffViewer = lazyWithRetry(() => import('./diff-viewer'))

export function LanguageServerWorkspaceEditDialog(): React.JSX.Element {
  const request = useSyncExternalStore(
    languageServerWorkspaceEditController.subscribe,
    languageServerWorkspaceEditController.getSnapshot
  )
  const open = request !== null
  const setContextualToursBlockingSurfaceVisible = useAppStore(
    (state) => state.setContextualToursBlockingSurfaceVisible
  )
  useEffect(() => {
    // Why: this controller-backed dialog is not represented by activeModal.
    setContextualToursBlockingSurfaceVisible(open)
    return () => setContextualToursBlockingSurfaceVisible(false)
  }, [open, setContextualToursBlockingSurfaceVisible])
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => !open && languageServerWorkspaceEditController.cancel()}
    >
      {request ? <WorkspaceEditContent key={request.id} request={request} /> : null}
    </Dialog>
  )
}

function WorkspaceEditContent({
  request
}: {
  request: LanguageServerWorkspaceEditRequest
}): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const files = request.plan.files
  const selected = files[selectedIndex] ?? files[0]
  const editCount = files.reduce((total, file) => total + file.editCount, 0)
  const diskFileCount = files.filter((file) => !file.isOpen).length

  return (
    <DialogContent
      showCloseButton={!request.applying}
      className="flex h-[80vh] w-[90vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
    >
      <DialogHeader className="border-border border-b p-4">
        <DialogTitle>{request.plan.title}</DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.editor.LanguageServerWorkspaceEditDialog.summary',
            'Review {{value0}} edits across {{value1}} files. {{value2}} closed files will be written to disk.',
            { value0: editCount, value1: files.length, value2: diskFileCount }
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1">
        <div className="border-border scrollbar-sleek w-56 shrink-0 overflow-y-auto border-r py-1">
          {files.map((file, index) => (
            <button
              key={file.filePath}
              type="button"
              aria-pressed={index === selectedIndex}
              className={`hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left text-xs ${index === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}
              onClick={() => setSelectedIndex(index)}
            >
              <FileCode className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono">{file.relativePath}</span>
                <span className="text-muted-foreground text-[11px]">
                  {translate(
                    'auto.components.editor.LanguageServerWorkspaceEditDialog.editCount',
                    '{{value0}} edits',
                    { value0: file.editCount }
                  )}
                  {file.isDirty
                    ? translate(
                        'auto.components.editor.LanguageServerWorkspaceEditDialog.unsaved',
                        ' · unsaved buffer'
                      )
                    : ''}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col">
          {selected ? (
            <Suspense fallback={<PreviewLoading />}>
              <DiffViewer
                modelKey={`language-server-edit:${request.id}:${selected.filePath}`}
                originalContent={selected.before}
                modifiedContent={selected.after}
                language={detectLanguage(selected.relativePath)}
                filePath={selected.filePath}
                relativePath={selected.relativePath}
                sideBySide
              />
            </Suspense>
          ) : null}
        </div>
      </div>

      <DialogFooter className="border-border items-center border-t p-4">
        {request.error ? (
          <div className="text-destructive mr-auto flex min-w-0 flex-1 items-start gap-2 text-xs">
            <WarningCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words">{request.error}</span>
          </div>
        ) : (
          <span className="text-muted-foreground mr-auto flex-1 text-[11px]">
            {translate(
              'auto.components.editor.LanguageServerWorkspaceEditDialog.undoHint',
              'Open-buffer edits use the editor’s normal save and undo behavior.'
            )}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={request.applying}
          onClick={() => languageServerWorkspaceEditController.cancel()}
        >
          {translate('auto.components.editor.LanguageServerWorkspaceEditDialog.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          disabled={request.applying}
          onClick={() => void languageServerWorkspaceEditController.confirm()}
        >
          {request.applying ? <LoadingIndicator className="mr-2 size-4" /> : null}
          {translate(
            'auto.components.editor.LanguageServerWorkspaceEditDialog.apply',
            'Apply changes'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function PreviewLoading(): React.JSX.Element {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
      <LoadingIndicator className="mr-2 size-4" />
      {translate(
        'auto.components.editor.LanguageServerWorkspaceEditDialog.loading',
        'Loading preview…'
      )}
    </div>
  )
}
