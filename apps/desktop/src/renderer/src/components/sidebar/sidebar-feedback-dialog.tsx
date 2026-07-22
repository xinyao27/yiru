import { GithubLogo as Github } from '@phosphor-icons/react'
/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: feedback viewer details are loaded through GitHub IPC after the dialog receives the issue URL. */
import React, { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ArrowSquareOut as ExternalLink } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { GitHubViewer } from '../../../../shared/types'
import { YIRU_GITHUB_ISSUES_URL } from '../../../../shared/yiru-github-repository'

type SubmitIdentity = {
  githubLogin: string | null
  githubEmail: string | null
}

type SidebarFeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function openExternalUrl(url: string): void {
  void window.api.shell.openUrl(url)
}

function getSubmitIdentity(viewer: GitHubViewer | null, anonymous: boolean): SubmitIdentity {
  if (anonymous || !viewer) {
    return {
      githubLogin: null,
      githubEmail: null
    }
  }

  return {
    githubLogin: viewer.login,
    githubEmail: viewer.email
  }
}

export function SidebarFeedbackDialog({
  open,
  onOpenChange
}: SidebarFeedbackDialogProps): React.JSX.Element {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewer, setViewer] = useState<GitHubViewer | null>(null)
  const [isViewerLoading, setIsViewerLoading] = useState(false)
  const [submitAnonymously, setSubmitAnonymously] = useState(false)
  const mountedRef = useMountedRef()
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setIsViewerLoading(true)
    void window.api.gh
      .viewer()
      .then((nextViewer) => {
        if (!cancelled) {
          setViewer(nextViewer)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setViewer(null)
          console.error('Failed to load GitHub viewer:', err)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsViewerLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleSubmit = async (): Promise<void> => {
    const trimmed = feedback.trim()
    if (!trimmed) {
      toast.warning(
        translate(
          'auto.components.sidebar.SidebarFeedbackDialog.a2fd890d9e',
          'Please enter feedback before submitting.'
        )
      )
      return
    }

    setIsSubmitting(true)
    try {
      const identity = getSubmitIdentity(viewer, submitAnonymously)
      // Why: submission is proxied through the main process via IPC because
      // the packaged Mac build loads the renderer from file://, which makes
      // cross-origin fetch() fail CORS preflight. Electron's net module in
      // the main process has no CORS restrictions and works uniformly in dev
      // and prod.
      const result = await window.api.feedback.submit({
        feedback: trimmed,
        submitAnonymously,
        githubLogin: identity.githubLogin,
        githubEmail: identity.githubEmail
      })

      if (!result.ok) {
        throw new Error(`Feedback request failed: ${result.error}`)
      }

      if (mountedRef.current) {
        toast.success(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.7a46c228b8',
            'Thanks for the feedback.'
          )
        )
        setFeedback('')
        setSubmitAnonymously(false)
        onOpenChange(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.60b721e857',
            'Failed to submit feedback. Please try again.'
          )
        )
      }
      console.error('Failed to submit feedback:', err)
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" initialFocus={feedbackTextareaRef}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.SidebarFeedbackDialog.0eb643f07f', 'Send Feedback')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.SidebarFeedbackDialog.a828fa4aee',
              "Share what's working, what's broken, or what Yiru should do next."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/70 bg-muted/30 space-y-2 rounded-md border p-3">
          <div className="text-foreground text-xs font-medium">
            {translate(
              'auto.components.sidebar.SidebarFeedbackDialog.9b33530b3d',
              'Report bugs and request features'
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => openExternalUrl(`${YIRU_GITHUB_ISSUES_URL}/`)}
            >
              <Github className="size-3.5" />
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.d245c4ef6c',
                'GitHub issues'
              )}
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </div>

        <textarea
          ref={feedbackTextareaRef}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.SidebarFeedbackDialog.d46ddd66fc',
            'What could we improve?'
          )}
          rows={7}
          className="border-border bg-background placeholder:text-muted-foreground min-h-32 w-full rounded-md border px-3 py-2 text-sm outline-none"
        />

        <div className="border-border/70 bg-muted/30 min-h-9 rounded-md border px-3 py-2">
          {viewer ? (
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                {translate('auto.components.sidebar.SidebarFeedbackDialog.c9e5ea0791', 'GitHub:')}{' '}
                <span className="text-foreground font-mono">
                  {viewer.login}
                  {viewer.email ? ` (${viewer.email})` : ''}
                </span>
              </span>
              <label className="text-foreground flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={submitAnonymously}
                  onChange={(event) => setSubmitAnonymously(event.target.checked)}
                  className={cn(
                    'size-3.5 rounded border border-border bg-background align-middle',
                    'accent-foreground'
                  )}
                />
                {translate(
                  'auto.components.sidebar.SidebarFeedbackDialog.5b120b9634',
                  'Submit anonymously'
                )}
              </label>
            </div>
          ) : isViewerLoading ? (
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.d20439c560',
                'Checking GitHub identity…'
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.8de03e23c5',
                'Submit with your typed feedback only, or connect `gh` to include GitHub identity.'
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {translate('auto.components.sidebar.SidebarFeedbackDialog.8bf619e4cf', 'Cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting || !feedback.trim()}>
            {isSubmitting
              ? translate('auto.components.sidebar.SidebarFeedbackDialog.69969ba364', 'Sending…')
              : translate('auto.components.sidebar.SidebarFeedbackDialog.f2e42e1307', 'Send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
