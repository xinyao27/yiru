import type React from 'react'
import { useEffect, useState } from 'react'

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

import type { SpoolFileTreeEntry } from '../../../../shared/spool/spool-operation-contract'

export type SpoolFileAction =
  | { kind: 'new-file' }
  | { kind: 'new-directory' }
  | { kind: 'rename'; entry: SpoolFileTreeEntry }
  | { kind: 'delete'; entry: SpoolFileTreeEntry }

export function SpoolFileActionDialog({
  action,
  busy,
  onClose,
  onSubmit
}: {
  action: SpoolFileAction | null
  busy: boolean
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
}): React.JSX.Element {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(action?.kind === 'rename' ? action.entry.name : '')
  }, [action])

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
            aria-label={translate('auto.components.spool.SpoolFileActionDialog.nameLabel', 'Name')}
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
            {translate('auto.components.spool.SpoolFileActionDialog.cancel', 'Cancel')}
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

function getActionCopy(action: SpoolFileAction | null): {
  title: string
  description: string
  label: string
} {
  switch (action?.kind) {
    case 'new-file':
      return {
        title: translate('auto.components.spool.SpoolFileActionDialog.newFileTitle', 'New file'),
        description: translate(
          'auto.components.spool.SpoolFileActionDialog.newFileDescription',
          'Create an empty file in the current remote folder.'
        ),
        label: translate('auto.components.spool.SpoolFileActionDialog.create', 'Create')
      }
    case 'new-directory':
      return {
        title: translate(
          'auto.components.spool.SpoolFileActionDialog.newDirectoryTitle',
          'New directory'
        ),
        description: translate(
          'auto.components.spool.SpoolFileActionDialog.newDirectoryDescription',
          'Create a directory in the current remote folder.'
        ),
        label: translate('auto.components.spool.SpoolFileActionDialog.create', 'Create')
      }
    case 'rename':
      return {
        title: translate('auto.components.spool.SpoolFileActionDialog.renameTitle', 'Rename item'),
        description: translate(
          'auto.components.spool.SpoolFileActionDialog.renameDescription',
          'Enter a new name for {{value0}}.',
          { value0: action.entry.name }
        ),
        label: translate('auto.components.spool.SpoolFileActionDialog.rename', 'Rename')
      }
    case 'delete':
      return {
        title: translate('auto.components.spool.SpoolFileActionDialog.deleteTitle', 'Delete item?'),
        description: translate(
          'auto.components.spool.SpoolFileActionDialog.deleteDescription',
          'This permanently deletes {{value0}} from the owner’s worktree.',
          { value0: action.entry.name }
        ),
        label: translate('auto.components.spool.SpoolFileActionDialog.delete', 'Delete')
      }
    case undefined:
      return { title: '', description: '', label: '' }
  }
}
