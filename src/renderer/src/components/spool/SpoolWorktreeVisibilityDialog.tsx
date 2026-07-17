import type React from 'react'
import { useState } from 'react'
import { Warning as AlertTriangle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

type VisibilityConfirmationCopy = {
  title: string
  description: string
  historyWarning: string
  shellWarning: string
  confirm: string
  failure: string
}

type VisibilityConfirmationProps = {
  open: boolean
  copy: VisibilityConfirmationCopy
  publish: () => Promise<void>
  onOpenChange: (open: boolean) => void
}

function SpoolVisibilityConfirmation({
  open,
  copy,
  publish,
  onOpenChange
}: VisibilityConfirmationProps): React.JSX.Element {
  const [publishing, setPublishing] = useState(false)

  const confirm = async (): Promise<void> => {
    if (publishing) {
      return
    }
    setPublishing(true)
    try {
      await publish()
      onOpenChange(false)
    } catch {
      toast.error(copy.failure)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={publishing ? undefined : onOpenChange}>
      <DialogContent showCloseButton={!publishing} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="space-y-2 leading-5">
            <p>{copy.historyWarning}</p>
            <p className="font-medium">{copy.shellWarning}</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={publishing}
            onClick={() => onOpenChange(false)}
          >
            {translate('auto.components.spool.SpoolWorktreeVisibilityDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={publishing} onClick={() => void confirm()}>
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SpoolWorktreeVisibilityDialog({
  open,
  worktreeId,
  worktreeName,
  onOpenChange
}: {
  open: boolean
  worktreeId: string
  worktreeName: string
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <SpoolVisibilityConfirmation
      open={open}
      onOpenChange={onOpenChange}
      publish={() =>
        window.api.spoolSharing.setWorktreeVisibility({
          worktreeId,
          visibility: 'public'
        })
      }
      copy={{
        title: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.title',
          'Make {{value0}} public?',
          { value0: worktreeName }
        ),
        description: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.description',
          'People using Yiru Desktop on your Tailnet will be able to open this worktree.'
        ),
        historyWarning: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.historyWarning',
          'All existing sessions, transcripts, terminal scrollback, and future terminal output will be readable.'
        ),
        shellWarning: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.shellWarning',
          'Terminal history may include content produced outside this worktree.'
        ),
        confirm: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.confirm',
          'Make public'
        ),
        failure: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.publishFailed',
          'Could not make this worktree public.'
        )
      }}
    />
  )
}

export function SpoolProjectVisibilityDialog({
  open,
  projectId,
  projectName,
  onOpenChange
}: {
  open: boolean
  projectId: string
  projectName: string
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  return (
    <SpoolVisibilityConfirmation
      open={open}
      onOpenChange={onOpenChange}
      publish={() =>
        window.api.spoolSharing.setProjectVisibility({
          projectId,
          visibility: 'public'
        })
      }
      copy={{
        title: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectTitle',
          'Make every current worktree in {{value0}} public?',
          { value0: projectName }
        ),
        description: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectDescription',
          'This applies once to every worktree currently in the project. Future worktrees remain private.'
        ),
        historyWarning: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectHistoryWarning',
          'All sessions, transcripts, terminal scrollback, and future terminal output in those worktrees will be readable.'
        ),
        shellWarning: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectShellWarning',
          'Terminal history may include content produced outside those worktrees.'
        ),
        confirm: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectConfirm',
          'Make all public'
        ),
        failure: translate(
          'auto.components.spool.SpoolWorktreeVisibilityDialog.projectPublishFailed',
          'Could not make these worktrees public.'
        )
      }}
    />
  )
}
