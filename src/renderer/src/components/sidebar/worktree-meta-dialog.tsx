import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  buildWorktreeMetaUpdates,
  parseGitHubWorkItemNumberForMetaField,
  type WorktreeMetaSavedPayload
} from './worktree-meta-updates'
import { getScreenSubmitShortcutLabel, isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'

function resizeCommentTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

const WorktreeMetaDialog = React.memo(function WorktreeMetaDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const submitShortcutLabel = getScreenSubmitShortcutLabel()

  const isEditMeta = activeModal === 'edit-meta'
  const isOpen = isEditMeta

  const worktreeId = typeof modalData.worktreeId === 'string' ? modalData.worktreeId : ''
  const currentDisplayName =
    typeof modalData.currentDisplayName === 'string' ? modalData.currentDisplayName : ''
  const currentPR = typeof modalData.currentPR === 'number' ? String(modalData.currentPR) : ''
  const currentComment =
    typeof modalData.currentComment === 'string' ? modalData.currentComment : ''
  const focusField = typeof modalData.focus === 'string' ? modalData.focus : 'comment'
  const afterSave =
    typeof modalData.afterSave === 'function'
      ? (modalData.afterSave as (payload: WorktreeMetaSavedPayload) => void | Promise<void>)
      : null

  const [displayNameInput, setDisplayNameInput] = useState('')
  const [prInput, setPrInput] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [saving, setSaving] = useState(false)
  const prInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevIsOpenRef = useRef(false)
  const displayNameInputRef = useRef<HTMLInputElement>(null)
  const mountedRef = useMountedRef()
  if (isOpen && !prevIsOpenRef.current) {
    setDisplayNameInput(currentDisplayName)
    setPrInput(currentPR)
    setCommentInput(currentComment)
  }
  prevIsOpenRef.current = isOpen

  const setCommentTextareaRef = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      textareaRef.current = textarea
      if (textarea && isEditMeta) {
        resizeCommentTextarea(textarea)
      }
    },
    [isEditMeta]
  )

  const handleCommentChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentInput(event.target.value)
    // Why: notes should grow in the same input event; a passive Effect leaves a stale height.
    resizeCommentTextarea(event.currentTarget)
  }, [])

  const canSave = useMemo(() => {
    if (!worktreeId) {
      return false
    }
    const trimmedPR = prInput.trim()
    return trimmedPR === '' || parseGitHubWorkItemNumberForMetaField(trimmedPR, 'pr') !== null
  }, [worktreeId, prInput])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  const handleSave = useCallback(async () => {
    if (!canSave) {
      return
    }
    setSaving(true)
    try {
      const updates = buildWorktreeMetaUpdates({
        displayNameInput,
        currentDisplayName,
        prInput,
        commentInput
      })

      await updateWorktreeMeta(worktreeId, updates)
      closeModal()
      // Why: follow-up refreshes should not turn a successful metadata save
      // into a failed dialog.
      try {
        void Promise.resolve(afterSave?.({ worktreeId, updates })).catch(console.error)
      } catch (error) {
        console.error(error)
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }, [
    worktreeId,
    canSave,
    displayNameInput,
    currentDisplayName,
    prInput,
    commentInput,
    updateWorktreeMeta,
    closeModal,
    afterSave,
    mountedRef
  ])

  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
      if (isPlainEnter || isScreenSubmitShortcut(e)) {
        e.preventDefault()
        e.stopPropagation()
        handleSave()
      }
    },
    [handleSave]
  )

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        initialFocus={() => {
          if (focusField === 'displayName') {
            return displayNameInputRef.current
          }
          if (focusField === 'pr') {
            return prInputRef.current
          }
          return textareaRef.current
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate(
              'auto.components.sidebar.WorktreeMetaDialog.382fd11a3e',
              'Edit Worktree Details'
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.WorktreeMetaDialog.65770ad0f0',
              'Edit the GitHub pull request link and notes for this workspace.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.sidebar.WorktreeMetaDialog.ad5e4e514f', 'Display Name')}
            </label>
            <Input
              ref={displayNameInputRef}
              value={displayNameInput}
              onChange={(e) => setDisplayNameInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.7f21e0464f',
                'Custom display name...'
              )}
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.459ad7f650',
                'Only changes the name shown in the sidebar — the folder on disk stays the same. Leave blank to use the branch or folder name.'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.sidebar.WorktreeMetaDialog.1b91db7e14', 'GH PR')}
            </label>
            <Input
              ref={prInputRef}
              value={prInput}
              onChange={(e) => setPrInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.077a4f7b5c',
                'PR # or GitHub URL'
              )}
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.5ae06f40fd',
                'Paste a pull request URL, or enter a number. Leave blank to remove the link.'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.sidebar.WorktreeMetaDialog.9c1d1e9b71', 'Comment')}
            </label>
            <textarea
              ref={setCommentTextareaRef}
              value={commentInput}
              onChange={handleCommentChange}
              onKeyDown={handleCommentKeyDown}
              placeholder={translate(
                'auto.components.sidebar.WorktreeMetaDialog.030d484fc0',
                'Notes about this worktree...'
              )}
              rows={3}
              className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 resize-none max-h-60 overflow-y-auto scrollbar-sleek"
            />
            <p className="text-[10px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.7f0be5e9a6',
                'Supports **markdown** — bold, lists, `code`, links. Press Enter or'
              )}{' '}
              {submitShortcutLabel}{' '}
              {translate(
                'auto.components.sidebar.WorktreeMetaDialog.b48c271d39',
                'to save, Shift+Enter for a new line.'
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            className="text-xs"
          >
            {translate('auto.components.sidebar.WorktreeMetaDialog.3db0a2a593', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave || saving} className="text-xs">
            {saving
              ? translate('auto.components.sidebar.WorktreeMetaDialog.61d6f612cf', 'Saving...')
              : translate('auto.components.sidebar.WorktreeMetaDialog.2174f17011', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default WorktreeMetaDialog
