import {
  Check,
  Cloud,
  SpinnerGap as Loader2,
  SignIn as LogIn,
  SignOut as LogOut,
  Plus
} from '@phosphor-icons/react'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type {
  YiruCloudOrgSummary,
  YiruProfileAuthStatus,
  YiruProfileSummary
} from '../../../../shared/yiru-profiles'

function getConnectLabel(authStatus: YiruProfileAuthStatus | null, connecting: boolean): string {
  if (connecting) {
    return translate('auto.components.yiru.profiles.switcher.signInWaiting', 'Waiting for sign-in…')
  }
  if (authStatus?.configured !== true) {
    return translate(
      'auto.components.yiru.profiles.switcher.cloud.unavailable',
      'Yiru sign-in unavailable'
    )
  }
  if (authStatus.state === 'reconnect-required') {
    return translate('auto.components.yiru.profiles.switcher.signInAgain', 'Sign in again')
  }
  return translate('auto.components.yiru.profiles.switcher.signIn', 'Sign in to Yiru')
}

export function YiruProfileCloudMenuItems({
  activeProfile,
  authStatus,
  connecting,
  profileActionDisabled,
  allowProfileCreation,
  separateAuthActions,
  onConnect,
  onCreateProfileForOrg,
  onSelectOrg,
  onRequestSignOut
}: {
  activeProfile: YiruProfileSummary
  authStatus: YiruProfileAuthStatus | null
  connecting: boolean
  profileActionDisabled: boolean
  allowProfileCreation: boolean
  separateAuthActions: boolean
  onConnect: () => void
  onCreateProfileForOrg: (organization: YiruCloudOrgSummary) => void
  onSelectOrg: (orgId: string) => void
  onRequestSignOut: () => void
}): React.JSX.Element {
  const cloudConfigured = authStatus?.configured === true
  const organizations = authStatus?.organizations ?? []
  const showOrganizationChoices = activeProfile.kind === 'cloud-linked' && organizations.length > 1
  // Why: profile creation is hidden in the downscoped account menu, so the
  // "Create profile for org" submenu only appears when multi-profile UI is on.
  const showCloudProfileCreation =
    allowProfileCreation && activeProfile.kind === 'cloud-linked' && organizations.length > 0
  const orgActionDisabled = profileActionDisabled || authStatus?.state !== 'connected'
  const activeOrgId = activeProfile.cloud?.activeOrgId
  const showSignIn = authStatus?.state !== 'connected'

  return (
    <>
      {showOrganizationChoices || showCloudProfileCreation ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {translate('auto.components.yiru.profiles.switcher.organization', 'Organization')}
          </DropdownMenuLabel>
          {showOrganizationChoices
            ? organizations.map((organization) => (
                <DropdownMenuItem
                  key={organization.orgId}
                  disabled={orgActionDisabled}
                  onClick={() => {
                    if (organization.orgId !== activeOrgId) {
                      onSelectOrg(organization.orgId)
                    }
                  }}
                  className="min-w-0"
                >
                  <Cloud />
                  <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                  {organization.orgId === activeOrgId ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              ))
            : null}
          {showCloudProfileCreation ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={orgActionDisabled}>
                <Plus />
                {translate(
                  'auto.components.yiru.profiles.switcher.create.profile.for.org',
                  'Create profile for org'
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {organizations.map((organization) => (
                  <DropdownMenuItem
                    key={organization.orgId}
                    onClick={() => onCreateProfileForOrg(organization)}
                    className="min-w-0"
                  >
                    <Cloud />
                    <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
        </>
      ) : null}

      {separateAuthActions || showOrganizationChoices || showCloudProfileCreation ? (
        <DropdownMenuSeparator />
      ) : null}
      {showSignIn ? (
        <DropdownMenuItem disabled={profileActionDisabled || !cloudConfigured} onClick={onConnect}>
          {connecting ? <Loader2 className="size-4 animate-spin" /> : <LogIn />}
          {getConnectLabel(authStatus, connecting)}
        </DropdownMenuItem>
      ) : null}
      {activeProfile.kind === 'cloud-linked' ? (
        <DropdownMenuItem disabled={profileActionDisabled} onClick={onRequestSignOut}>
          <LogOut />
          {translate('auto.components.yiru.profiles.switcher.signout', 'Sign out')}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
