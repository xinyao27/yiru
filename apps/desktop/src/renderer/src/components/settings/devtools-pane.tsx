import {
  Bell,
  Info,
  XCircle as OctagonX,
  Sparkle as Sparkles,
  Trash as Trash2
} from '@phosphor-icons/react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'

import { showDeleteWorktreeFailureToast } from '../sidebar/delete-worktree-failure-toast'
import { showLocalBaseRefUpdateSuggestionToast } from '../sidebar/local-base-ref-suggestion-toast'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { SettingsSubsectionHeader } from './settings-form-controls'

const LONG_WORKSPACE_NAME = 'feature/dev-toast-layout-with-a-long-workspace-name'
const DEV_TOAST_DESCRIPTION =
  'This is intentionally long copy for checking width, line wrapping, icon alignment, action placement, and close-button overlap in the shared toast frame.'

type DevToastAction = {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}

function DevToastActionButton({ action }: { action: DevToastAction }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={action.onClick}
      className="h-auto min-h-9 justify-start gap-2 px-3 py-2 text-left whitespace-normal"
    >
      <span className="text-muted-foreground mt-0.5">{action.icon}</span>
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-medium">{action.title}</span>
        <span className="text-muted-foreground block text-xs leading-4">{action.description}</span>
      </span>
    </Button>
  )
}

function showNativeActionToast(): void {
  toast.info(
    translate(
      'auto.components.settings.DevToolsPane.nativeActionLayoutCheck',
      'Native action layout check'
    ),
    {
      description: DEV_TOAST_DESCRIPTION,
      duration: 10000,
      cancel: {
        label: translate('auto.components.settings.DevToolsPane.secondary', 'Secondary'),
        onClick: () =>
          toast.message(
            translate(
              'auto.components.settings.DevToolsPane.secondaryActionClicked',
              'Secondary action clicked'
            )
          )
      },
      action: {
        label: translate('auto.components.settings.DevToolsPane.primaryAction', 'Primary action'),
        onClick: () =>
          toast.success(
            translate(
              'auto.components.settings.DevToolsPane.primaryActionClicked',
              'Primary action clicked'
            )
          )
      }
    }
  )
}

function showBehindBaseRefToast(): void {
  let enabled = false
  showLocalBaseRefUpdateSuggestionToast(
    {
      baseRef: 'origin/canary',
      localBranch: 'canary',
      behind: 2
    },
    {
      updateSettings: async (updates) => {
        enabled = updates.refreshLocalBaseRefOnWorktreeCreate === true
      },
      getSettings: () =>
        ({
          refreshLocalBaseRefOnWorktreeCreate: enabled
        }) as AppState['settings'],
      openSettingsPage: () => {},
      openSettingsTarget: () => {}
    }
  )
}

function showDeleteFailureToast(): void {
  showDeleteWorktreeFailureToast({
    error: translate(
      'auto.components.settings.DevToolsPane.branchHasChanges',
      'branch has changes'
    ),
    canForceDelete: true,
    forceDeleteReason: 'dirty',
    onViewChanges: () =>
      toast.message(
        translate(
          'auto.components.settings.DevToolsPane.viewChangesClicked',
          'View Changes clicked'
        )
      ),
    onForceDelete: () =>
      toast.error(
        translate(
          'auto.components.settings.DevToolsPane.forceDeleteClicked',
          'Force Delete clicked'
        ),
        {
          description: translate(
            'auto.components.settings.DevToolsPane.devOnlyCallback',
            'Dev-only callback.'
          )
        }
      ),
    worktreeId: 'dev-toast-worktree',
    worktreeName: LONG_WORKSPACE_NAME
  })
}

// Dev-only preview of the first-party Yiru Cloud sign-in. The sidebar/titlebar
// account switcher is hidden in packaged builds while the feature is in
// progress; this surfaces it (and its status) in dev when the env vars are set.
function YiruCloudDevSubsection(): React.JSX.Element {
  const authStatus = useAppStore((s) => s.yiruProfileAuthStatus)
  const connecting = useAppStore((s) => s.yiruProfileConnecting)
  const connect = useAppStore((s) => s.connectCurrentYiruProfile)
  const signOut = useAppStore((s) => s.signOutCurrentYiruProfile)
  const refresh = useAppStore((s) => s.fetchYiruProfileAuthStatus)
  const configured = authStatus?.configured === true
  const connected = authStatus?.state === 'connected'

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <SettingsSubsectionHeader
          title={translate('auto.components.settings.DevToolsPane.yiruCloud', 'Yiru Cloud')}
          description={translate(
            'auto.components.settings.DevToolsPane.yiruCloudDescription',
            'Dev-only preview of first-party cloud sign-in. Hidden in production; in dev it also appears in the sidebar account switcher once YIRU_CLOUD_API_URL and YIRU_CLOUD_CLIENT_ID are set.'
          )}
        />
        <Badge variant="outline" className="mt-0.5">
          {translate('auto.components.settings.DevToolsPane.devOnly', 'Dev only')}
        </Badge>
      </div>

      {configured ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {translate('auto.components.settings.DevToolsPane.yiruCloudStatus', 'Status')}:{' '}
            <span className="text-foreground font-medium">{authStatus?.state}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connecting}
                onClick={() => void signOut()}
              >
                {translate('auto.components.settings.DevToolsPane.yiruCloudSignOut', 'Sign out')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={connecting}
                onClick={() => void connect()}
              >
                {translate(
                  'auto.components.settings.DevToolsPane.yiruCloudConnect',
                  'Connect profile'
                )}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>
              {translate(
                'auto.components.settings.DevToolsPane.yiruCloudRefresh',
                'Refresh status'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {authStatus?.setupMessage ??
            translate(
              'auto.components.settings.DevToolsPane.yiruCloudNotConfigured',
              'Set YIRU_CLOUD_API_URL and YIRU_CLOUD_CLIENT_ID to preview Yiru Cloud sign-in in this dev build.'
            )}
        </p>
      )}
    </section>
  )
}

export function DevToolsPane(): React.JSX.Element {
  const actions: DevToastAction[] = [
    {
      title: translate('auto.components.settings.DevToolsPane.infoToast', 'Info toast'),
      description: translate(
        'auto.components.settings.DevToolsPane.infoToastDescription',
        'Long informational copy with no explicit action.'
      ),
      icon: <Info className="size-4" />,
      onClick: () =>
        toast.info(
          translate(
            'auto.components.settings.DevToolsPane.localCanaryBehind',
            'Local canary is behind origin/canary'
          ),
          {
            description: DEV_TOAST_DESCRIPTION,
            duration: 10000
          }
        )
    },
    {
      title: translate('auto.components.settings.DevToolsPane.successToast', 'Success toast'),
      description: translate(
        'auto.components.settings.DevToolsPane.successToastDescription',
        'Short confirmation state.'
      ),
      icon: <Sparkles className="size-4" />,
      onClick: () =>
        toast.success(
          translate('auto.components.settings.DevToolsPane.settingsSaved', 'Settings saved'),
          {
            description: translate(
              'auto.components.settings.DevToolsPane.shortSuccessCopy',
              'Short success copy.'
            )
          }
        )
    },
    {
      title: translate('auto.components.settings.DevToolsPane.errorToast', 'Error toast'),
      description: translate(
        'auto.components.settings.DevToolsPane.errorToastDescription',
        'Long error copy without recovery actions.'
      ),
      icon: <OctagonX className="size-4" />,
      onClick: () =>
        toast.error(
          translate(
            'auto.components.settings.DevToolsPane.failedToSyncWorkspaceMetadata',
            'Failed to sync workspace metadata'
          ),
          {
            description: DEV_TOAST_DESCRIPTION,
            duration: 10000
          }
        )
    },
    {
      title: translate(
        'auto.components.settings.DevToolsPane.nativeActionToast',
        'Native action toast'
      ),
      description: translate(
        'auto.components.settings.DevToolsPane.nativeActionToastDescription',
        'Uses Sonner action and cancel slots.'
      ),
      icon: <Bell className="size-4" />,
      onClick: showNativeActionToast
    },
    {
      title: translate(
        'auto.components.settings.DevToolsPane.deleteFailureToast',
        'Delete failure toast'
      ),
      description: translate(
        'auto.components.settings.DevToolsPane.deleteFailureToastDescription',
        'Custom footer with View and Force Delete.'
      ),
      icon: <Trash2 className="size-4" />,
      onClick: showDeleteFailureToast
    },
    {
      title: translate(
        'auto.components.settings.DevToolsPane.behindBaseRefToast',
        'Behind base ref toast'
      ),
      description: translate(
        'auto.components.settings.DevToolsPane.behindBaseRefToastDescription',
        'Persistent prompt with an inline Settings link and footer action.'
      ),
      icon: <Bell className="size-4" />,
      onClick: showBehindBaseRefToast
    }
  ]

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <SettingsSubsectionHeader
            title={translate(
              'auto.components.settings.DevToolsPane.notificationPlayground',
              'Notification playground'
            )}
            description={translate(
              'auto.components.settings.DevToolsPane.notificationPlaygroundDescription',
              'Dev-only triggers for checking toast layout, recovery actions, and long-copy wrapping.'
            )}
          />
          <Badge variant="outline" className="mt-0.5">
            {translate('auto.components.settings.DevToolsPane.devOnly', 'Dev only')}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((action) => (
            <DevToastActionButton key={action.title} action={action} />
          ))}
        </div>
      </section>

      <YiruCloudDevSubsection />
    </div>
  )
}
