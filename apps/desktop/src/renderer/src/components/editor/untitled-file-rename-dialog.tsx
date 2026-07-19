import { FolderOpen } from '@phosphor-icons/react'
import React, { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { getRelativePathInsideRoot } from '@/lib/path'

type UntitledFileRenameDialogProps = {
  open: boolean
  currentName: string
  worktreePath: string
  externalError?: string | null
  disableBrowse?: boolean
  onClose: () => void
  onConfirm: (newRelativePath: string) => void
}

export function UntitledFileRenameDialog({
  open,
  currentName,
  worktreePath,
  externalError,
  disableBrowse = false,
  onClose,
  onConfirm
}: UntitledFileRenameDialogProps): React.JSX.Element {
  const baseName = currentName.replace(/\.md$/, '')
  const [name, setName] = useState(baseName)
  const [dir, setDir] = useState(worktreePath)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const focusFrameRef = useRef<number | null>(null)
  const seededOpenStateRef = useRef({ open: false, baseName, worktreePath })
  const mountedRef = useMountedRef()

  const displayError = externalError ?? error

  const cancelFocusFrame = useCallback(() => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
  }, [])

  const setNameInputNode = useCallback(
    (node: HTMLInputElement | null): void => {
      if (!node) {
        // Why: on a quick close, Radix may unmount the input before the
        // deferred focus frame runs. Cancel it from the ref cleanup path.
        cancelFocusFrame()
      }
      nameInputRef.current = node
    },
    [cancelFocusFrame]
  )

  // Why: seed the drafts before the open dialog paints; focus is handled by
  // Radix's open lifecycle below so this does not need a post-render Effect.
  if (open) {
    const seeded = seededOpenStateRef.current
    if (!seeded.open || seeded.baseName !== baseName || seeded.worktreePath !== worktreePath) {
      seededOpenStateRef.current = { open: true, baseName, worktreePath }
      setName(baseName)
      setDir(worktreePath)
      setError(null)
    }
  } else if (seededOpenStateRef.current.open) {
    seededOpenStateRef.current = { open: false, baseName, worktreePath }
  }

  const handleBrowse = useCallback(async () => {
    const picked = await window.api.shell.pickDirectory({ defaultPath: dir || worktreePath })
    if (!picked) {
      return
    }
    if (!mountedRef.current) {
      return
    }
    setDir(picked)
    setError(null)
  }, [dir, mountedRef, worktreePath])

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim().replace(/\.md$/, '')
    if (!trimmedName) {
      setError('Name cannot be empty')
      return
    }
    if (/[/\\]/.test(trimmedName)) {
      setError('Name cannot contain path separators')
      return
    }

    const trimmedDir = dir.trim().replace(/[\\/]+$/, '')
    if (!trimmedDir) {
      setError('Folder path cannot be empty')
      return
    }

    const relDir = getRelativePathInsideRoot(trimmedDir, worktreePath)
    if (relDir === null) {
      setError('Folder must be inside the current workspace')
      return
    }

    const fileName = `${trimmedName}.md`
    const relativePath = relDir ? `${relDir}/${fileName}` : fileName
    onConfirm(relativePath)
  }, [name, dir, worktreePath, onConfirm])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[340px]"
        initialFocus={() => {
          cancelFocusFrame()
          focusFrameRef.current = requestAnimationFrame(() => {
            focusFrameRef.current = null
            nameInputRef.current?.focus()
            nameInputRef.current?.select()
          })
          // Why: return false so Base UI skips its own auto-focus; the rAF
          // above focuses and selects the name input instead.
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.editor.UntitledFileRenameDialog.674b046582', 'Save as')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.editor.UntitledFileRenameDialog.e365f3c638',
              'Name your markdown file and pick a folder.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
              {translate('auto.components.editor.UntitledFileRenameDialog.b6ed807cc6', 'Name')}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                ref={setNameInputNode}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={translate(
                  'auto.components.editor.UntitledFileRenameDialog.c8ac7868e6',
                  'file name'
                )}
                className="h-8 text-sm"
                aria-invalid={!!displayError}
              />
              <span className="text-muted-foreground shrink-0 text-xs">
                {translate('auto.components.editor.UntitledFileRenameDialog.2d7d39dc63', '.md')}
              </span>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
              {translate('auto.components.editor.UntitledFileRenameDialog.30099dca46', 'Folder')}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                value={dir}
                onChange={(e) => {
                  setDir(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={disableBrowse}
                onClick={() => void handleBrowse()}
                title={
                  disableBrowse
                    ? translate(
                        'auto.components.editor.UntitledFileRenameDialog.5e7f0d8a80',
                        'Folder picker unavailable for remote files'
                      )
                    : translate(
                        'auto.components.editor.UntitledFileRenameDialog.725868c75d',
                        'Browse folders'
                      )
                }
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        {displayError && <p className="text-destructive mt-1 text-xs">{displayError}</p>}
        <DialogFooter className="mt-1">
          <Button variant="outline" size="sm" onClick={onClose}>
            {translate('auto.components.editor.UntitledFileRenameDialog.949711deb4', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            {translate('auto.components.editor.UntitledFileRenameDialog.a7dd27b0bc', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
