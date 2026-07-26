import type React from 'react'
import { useState } from 'react'

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
import { translate } from '@/i18n/i18n'

import type { CoworkingFileTreeEntry } from '../../../../shared/coworking/operation-contract'

export type CoworkingFileAction =
  | { kind: 'new-file' }
  | { kind: 'new-directory' }
  | { kind: 'rename'; entry: CoworkingFileTreeEntry }
  | { kind: 'delete'; entry: CoworkingFileTreeEntry }

export function CoworkingFileActionDialog({
  action,
  busy,
  onClose,
  onSubmit
}: {
  action: CoworkingFileAction | null
  busy: boolean
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
}): React.JSX.Element {
  const [value, setValue] = useState('')
  // Why: each dialog invocation is a fresh `action` object, even when reopened
  // for the same kind — this compares the reference during render rather than
  // an effect, so the field resets exactly on that per-open identity change.
  const [trackedAction, setTrackedAction] = useState(action)
  if (action !== trackedAction) {
    setTrackedAction(action)
    setValue(action?.kind === 'rename' ? action.entry.name : '')
  }

  const needsName =
    action?.kind === 'new-file' || action?.kind === 'new-directory' || action?.kind === 'rename'
  const copy = getActionCopy(action)

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {needsName ? (
          <Input
            autoFocus
            value={value}
            disabled={busy}
            aria-label={translate(
              'auto.components.coworking.CoworkingFileActionDialog.nameLabel',
              'Name'
            )}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.trim()) {
                void onSubmit(value.trim())
              }
            }}
          />
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {translate('auto.components.coworking.CoworkingFileActionDialog.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            variant={action?.kind === 'delete' ? 'destructive' : 'default'}
            disabled={busy || (needsName && !value.trim())}
            onClick={() => void onSubmit(value.trim())}
          >
            {copy.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getActionCopy(action: CoworkingFileAction | null): {
  title: string
  description: string
  label: string
} {
  switch (action?.kind) {
    case 'new-file':
      return {
        title: translate(
          'auto.components.coworking.CoworkingFileActionDialog.newFileTitle',
          'New file'
        ),
        description: translate(
          'auto.components.coworking.CoworkingFileActionDialog.newFileDescription',
          'Create an empty file in the current remote folder.'
        ),
        label: translate('auto.components.coworking.CoworkingFileActionDialog.create', 'Create')
      }
    case 'new-directory':
      return {
        title: translate(
          'auto.components.coworking.CoworkingFileActionDialog.newDirectoryTitle',
          'New directory'
        ),
        description: translate(
          'auto.components.coworking.CoworkingFileActionDialog.newDirectoryDescription',
          'Create a directory in the current remote folder.'
        ),
        label: translate('auto.components.coworking.CoworkingFileActionDialog.create', 'Create')
      }
    case 'rename':
      return {
        title: translate(
          'auto.components.coworking.CoworkingFileActionDialog.renameTitle',
          'Rename item'
        ),
        description: translate(
          'auto.components.coworking.CoworkingFileActionDialog.renameDescription',
          'Enter a new name for {{value0}}.',
          { value0: action.entry.name }
        ),
        label: translate('auto.components.coworking.CoworkingFileActionDialog.rename', 'Rename')
      }
    case 'delete':
      return {
        title: translate(
          'auto.components.coworking.CoworkingFileActionDialog.deleteTitle',
          'Delete item?'
        ),
        description: translate(
          'auto.components.coworking.CoworkingFileActionDialog.deleteDescription',
          'This permanently deletes {{value0}} from the owner’s worktree.',
          { value0: action.entry.name }
        ),
        label: translate('auto.components.coworking.CoworkingFileActionDialog.delete', 'Delete')
      }
    case undefined:
      return { title: '', description: '', label: '' }
  }
}
