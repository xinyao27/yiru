import {
  Warning as AlertTriangle,
  Star,
  ArrowSquareOut as ExternalLink,
  FolderPlus,
  GitMerge,
  X
} from '@phosphor-icons/react'
import { YIRU_GITHUB_STARGAZERS_URL } from '@yiru/workbench-model/product'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/use-mounted-ref'
import { useShortcutKeyDetails, type ShortcutKeyComboDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'

import logo from '../../../../resources/logo.svg'
import { isGitRepoKind } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/types'
import { cn } from '../lib/class-names'
import { useAppStore } from '../store'
import {
  dismissPreflightIssue,
  githubProjectKeys,
  isPreflightIssueDismissed
} from './landing-preflight-dismissal'
import {
  getLandingPreflightIssues,
  hasGitHubBackedProject,
  type PreflightIssue
} from './landing-preflight-issues'
import { ShortcutKeyCombo } from './shortcut-key-combo'

type ShortcutItem = {
  id: string
  shortcut: ShortcutKeyComboDetails
  action: string
}

type StarState = 'loading' | 'starred' | 'not-starred' | 'web-fallback' | 'hidden'

function GitHubStarButton({ hasRepos }: { hasRepos: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<StarState>('loading')
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useMountedRef()

  useEffect(() => {
    let cancelled = false
    void window.api.gh.checkYiruStarred().then((result) => {
      if (cancelled) {
        return
      }
      if (result === null) {
        setState('web-fallback')
      } else {
        setState(result ? 'starred' : 'not-starred')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDocClick = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const handleClick = async (): Promise<void> => {
    if (state === 'starred') {
      setMenuOpen((v) => !v)
      return
    }
    if (state === 'web-fallback') {
      await window.api.shell.openUrl(YIRU_GITHUB_STARGAZERS_URL)
      return
    }
    if (state !== 'not-starred') {
      return
    }
    setState('starred') // optimistic
    const ok = await window.api.gh.starYiru('landing')
    if (!ok) {
      if (mountedRef.current) {
        setState('web-fallback')
      }
      return
    }
    // Why: starring from any entry point mutes the threshold-based nag.
    // Without this the background notification could still fire on the next
    // threshold crossing, which would feel like a bug to the user.
    await window.api.starNag.complete()
  }

  // Hide once the user has already starred and added a repo.
  if (state === 'hidden' || (state === 'starred' && hasRepos)) {
    return null
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <Button
        variant="outline"
        size="default"
        className={cn(
          'focus-visible:border-amber-500/80 focus-visible:bg-amber-400/10 dark:focus-visible:border-amber-400/50 dark:focus-visible:bg-amber-400/[0.08]',
          'py-1.5 text-[13px] duration-300',
          state === 'loading' && 'pointer-events-none opacity-0',
          state !== 'starred' &&
            'border-amber-500/60 text-amber-700 hover:border-amber-500/80 hover:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-300/90 dark:hover:border-amber-400/50 dark:hover:bg-amber-400/[0.08]',
          state === 'starred' &&
            'border-amber-500/50 bg-amber-400/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/[0.06] dark:text-amber-400/60'
        )}
        onClick={handleClick}
        disabled={state === 'loading'}
      >
        {state === 'web-fallback' ? (
          <ExternalLink
            weight="regular"
            className="size-3.5 text-amber-600 transition-all duration-300 dark:text-amber-400/80"
          />
        ) : (
          <Star
            className={cn(
              'size-3.5 transition-all duration-300',
              state === 'starred'
                ? 'fill-amber-500/70 text-amber-500/70 dark:fill-amber-400/60 dark:text-amber-400/60'
                : 'text-amber-600 dark:text-amber-400/80'
            )}
          />
        )}
        {state === 'starred'
          ? translate('auto.components.Landing.ec43b38ba7', 'Starred on GitHub')
          : state === 'web-fallback'
            ? translate('auto.components.Landing.157bb5ecbb', 'Open GitHub')
            : translate('auto.components.Landing.0d0ace8861', 'Star on GitHub')}
      </Button>
      {state === 'starred' && menuOpen && (
        <div className="border-border bg-popover absolute top-[calc(100%+4px)] right-0 z-10 min-w-[100px] border py-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-foreground hover:bg-muted focus-visible:bg-muted w-full justify-start gap-0 border-0 py-1.5 text-left text-[13px] font-normal whitespace-normal"
            onClick={() => {
              setMenuOpen(false)
              setState('hidden')
            }}
          >
            {translate('auto.components.Landing.c1cf168479', 'Hide')}
          </Button>
        </div>
      )}
    </div>
  )
}

function PreflightBanner({
  issues,
  repos
}: {
  issues: PreflightIssue[]
  repos: Repo[]
}): React.JSX.Element | null {
  // Why: keying the seed on the current GitHub project set means adding a new
  // GitHub project (which changes the key) re-evaluates dismissals, so a lapsed
  // dismissal re-surfaces the nudge without a manual reset.
  const githubKey = githubProjectKeys(repos).join('|')
  const [dismissed, setDismissed] = useState<Set<string>>(
    () =>
      new Set(
        issues
          .filter((issue) => issue.dismissible && isPreflightIssueDismissed(issue.id, repos))
          .map((issue) => issue.id)
      )
  )

  useEffect(() => {
    setDismissed(
      new Set(
        issues
          .filter((issue) => issue.dismissible && isPreflightIssueDismissed(issue.id, repos))
          .map((issue) => issue.id)
      )
    )
    // Why: re-seed only when the GitHub project set changes; issues identity is
    // stable per render and would otherwise reset transient dismiss state.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [githubKey])

  const visibleIssues = issues.filter((issue) => !dismissed.has(issue.id))
  if (visibleIssues.length === 0) {
    return null
  }

  const dismiss = (issue: PreflightIssue): void => {
    dismissPreflightIssue(issue.id, repos)
    setDismissed((prev) => new Set(prev).add(issue.id))
  }

  return (
    // Why: cap width below the max-w-lg column so the card reads as part of the
    // centered content stack instead of stretching edge-to-edge. The styleguide
    // reserves color for true error state — these are soft setup nudges, so use
    // the quiet muted/border surface, not an amber frame.
    <div className="border-border bg-muted/40 w-full max-w-sm space-y-1.5 border p-3">
      {visibleIssues.map((issue) => (
        <div key={issue.id} className="flex items-start gap-3 px-1 py-1.5 first:pt-0 last:pb-0">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500/70" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-foreground text-[13px] leading-snug font-medium">{issue.title}</p>
            <p className="text-muted-foreground text-xs leading-snug">{issue.description}</p>
            <Button
              variant="ghost"
              size="xs"
              className="text-primary focus-visible:bg-accent mt-1 h-auto border-0 p-0 underline-offset-4 hover:underline"
              onClick={() => window.api.shell.openUrl(issue.fixUrl)}
            >
              {issue.fixLabel}
              <ExternalLink weight="regular" className="size-3" />
            </Button>
          </div>
          {issue.dismissible && (
            <Button
              variant="quiet"
              size="xs"
              className="/70 -mt-0.5 -mr-1 h-auto border-0 p-1"
              onClick={() => dismiss(issue)}
              aria-label={translate('auto.components.Landing.preflightDismiss', 'Dismiss')}
            >
              <X weight="regular" className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const openModal = useAppStore((s) => s.openModal)

  const createTargetLabel =
    repos.length > 0 && repos.every((repo) => isGitRepoKind(repo)) ? 'Worktree' : 'Workspace'
  const canCreateWorktree = repos.length > 0
  const hasGitHubProject = useMemo(() => hasGitHubBackedProject(repos), [repos])
  const showGitHubSupportFooter = repos.length === 0 || hasGitHubProject

  const [preflightIssues, setPreflightIssues] = useState<PreflightIssue[]>([])

  useEffect(() => {
    let cancelled = false
    const refreshPreflight = (force = false): void => {
      void window.api.preflight.check(force ? { force: true } : undefined).then((status) => {
        if (cancelled) {
          return
        }
        setPreflightIssues(
          getLandingPreflightIssues(status, { hasGitHubBackedProject: hasGitHubProject })
        )
      })
    }

    // oxlint-disable-next-line react-doctor/no-initialize-state -- Why: preflight status is read from an external IPC probe on mount and focus.
    refreshPreflight()

    // Why: users often install/authenticate gh outside Yiru. Re-check when the
    // window becomes active again so the landing warning clears without relaunch.
    const handleWindowActive = (): void => {
      if (document.visibilityState === 'visible') {
        refreshPreflight(true)
      }
    }

    document.addEventListener('visibilitychange', handleWindowActive)
    window.addEventListener('focus', handleWindowActive)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleWindowActive)
      window.removeEventListener('focus', handleWindowActive)
    }
  }, [hasGitHubProject])

  useEffect(() => {
    if (preflightIssues.length === 0) {
      return
    }

    let cancelled = false
    // Why: some users complete `gh auth login` without ever leaving the Yiru
    // window. Poll only while a warning is visible so the banner self-clears.
    const intervalId = window.setInterval(() => {
      void window.api.preflight.check({ force: true }).then((status) => {
        if (cancelled) {
          return
        }
        setPreflightIssues(
          getLandingPreflightIssues(status, { hasGitHubBackedProject: hasGitHubProject })
        )
      })
    }, 30000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [hasGitHubProject, preflightIssues.length])

  const createWorktreeShortcut = useShortcutKeyDetails('workspace.create')
  const previousWorktreeShortcut = useShortcutKeyDetails('worktree.navigateUp')
  const nextWorktreeShortcut = useShortcutKeyDetails('worktree.navigateDown')
  const shortcuts = useMemo<ShortcutItem[]>(() => {
    return [
      {
        id: 'create',
        shortcut: createWorktreeShortcut,
        action: `Create ${createTargetLabel.toLowerCase()}`
      },
      { id: 'up', shortcut: previousWorktreeShortcut, action: 'Move up workspace' },
      { id: 'down', shortcut: nextWorktreeShortcut, action: 'Move down workspace' }
    ]
  }, [createTargetLabel, createWorktreeShortcut, nextWorktreeShortcut, previousWorktreeShortcut])

  return (
    <div className="bg-background absolute inset-0 flex items-center justify-center">
      <div className="w-full max-w-lg px-6">
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="border-border/80 flex size-20 items-center justify-center border"
            style={{ backgroundColor: '#12181e' }}
          >
            <img
              src={logo}
              alt={translate('auto.components.Landing.520304a067', 'Yiru logo')}
              className="size-12"
            />
          </div>
          <h1 className="text-foreground text-4xl font-bold tracking-tight">
            {translate('auto.components.Landing.6ca6ff404e', 'YIRU')}
          </h1>

          {preflightIssues.length > 0 && <PreflightBanner issues={preflightIssues} repos={repos} />}

          <p className="text-muted-foreground text-center text-sm">
            {canCreateWorktree
              ? translate(
                  'auto.components.Landing.9c00bd4adf',
                  'Select a workspace from the sidebar to begin.'
                )
              : translate('auto.components.Landing.cd21242762', 'Add a project to get started.')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button
              variant="secondary"
              size="default"
              className="bg-secondary/70 border-border/80 text-foreground hover:bg-accent focus-visible:bg-accent gap-1.5 border text-sm transition-colors"
              onClick={() => openModal('add-repo')}
            >
              <FolderPlus className="size-3.5" />
              {translate('auto.components.Landing.f9eaa9e12d', 'Add Project')}
            </Button>

            <Button
              variant="secondary"
              size="default"
              className="bg-secondary/70 border-border/80 text-foreground enabled:hover:bg-accent enabled:focus-visible:bg-accent gap-1.5 border text-sm transition-colors enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canCreateWorktree}
              title={
                !canCreateWorktree
                  ? translate('auto.components.Landing.f05d237049', 'Add a project first')
                  : undefined
              }
              onClick={() => openModal('new-workspace-composer', { telemetrySource: 'unknown' })}
            >
              <GitMerge className="size-3.5" />
              {translate('auto.components.Landing.76a95f7f47', 'Create')}{' '}
              {createTargetLabel.toLowerCase()}
            </Button>
          </div>

          <div className="mt-6 w-full max-w-xs space-y-2">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-muted-foreground text-sm">{shortcut.action}</span>
                <ShortcutKeyCombo
                  keys={shortcut.shortcut.keys}
                  doubleTap={shortcut.shortcut.doubleTap}
                  separatorClassName="mx-0.5 text-[10px] text-muted-foreground"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {showGitHubSupportFooter && (
        <div className="absolute right-0 bottom-6 left-0 flex justify-center">
          <GitHubStarButton hasRepos={repos.length > 0} />
        </div>
      )}
    </div>
  )
}
