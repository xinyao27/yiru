import {
  Check,
  UserCircle as CircleUserRound,
  Cloud,
  Laptop,
  GearSix as Settings2,
  Users,
  CaretDown as ChevronDown,
  Plus
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store'

import type { YiruCloudOrgSummary, YiruProfileSummary } from '../../../../shared/yiru-profiles'
import { getYiruAccountIdentity } from './yiru-account-identity'
import { YiruProfileAvatar } from './yiru-profile-avatar'
import { YiruProfileCloudMenuItems } from './yiru-profile-cloud-menu-items'
import { YiruProfileCreateDialog } from './yiru-profile-create-dialog'
import { YiruProfileManagementDialog } from './yiru-profile-management-dialog'
import { YiruProfileMenuHeader } from './yiru-profile-menu-header'
import { YiruProfileOrgMembersDialog } from './yiru-profile-org-members-dialog'
import { YiruProfileSignOutConfirmDialog } from './yiru-profile-sign-out-confirm-dialog'
import { YiruProfileSwitchConfirmDialog } from './yiru-profile-switch-confirm-dialog'
import { getYiruProfileSwitchLiveWorkSummary } from './yiru-profile-switch-liveness'

function isWebClient(): boolean {
  return Boolean((window as unknown as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__)
}

function getProfileSubtitle(profile: YiruProfileSummary): string {
  if (profile.cloud?.activeOrgName) {
    return profile.cloud.activeOrgName
  }
  if (profile.cloud?.email) {
    return profile.cloud.email
  }
  return translate('auto.components.yiru.profiles.switcher.b4f9d1125d', 'Local')
}

export function YiruProfileSwitcher({
  placement = 'titlebar'
}: {
  placement?: 'titlebar' | 'sidebar'
}): React.JSX.Element | null {
  const profiles = useAppStore((s) => s.yiruProfiles)
  const activeProfileId = useAppStore((s) => s.activeYiruProfileId)
  const loading = useAppStore((s) => s.yiruProfilesLoading)
  const switching = useAppStore((s) => s.yiruProfileSwitching)
  const connecting = useAppStore((s) => s.yiruProfileConnecting)
  const authStatus = useAppStore((s) => s.yiruProfileAuthStatus)
  const multiProfileUi = useAppStore((s) => s.yiruProfilesMultiProfileUi)
  const fetchProfiles = useAppStore((s) => s.fetchYiruProfiles)
  const createLocalProfile = useAppStore((s) => s.createLocalYiruProfile)
  const createCloudLinkedProfile = useAppStore((s) => s.createCloudLinkedYiruProfile)
  const connectCurrentProfile = useAppStore((s) => s.connectCurrentYiruProfile)
  const signOutCurrentProfile = useAppStore((s) => s.signOutCurrentYiruProfile)
  const selectOrg = useAppStore((s) => s.selectYiruProfileOrg)
  const switchProfile = useAppStore((s) => s.switchYiruProfile)
  const liveWorkSummary = useAppStore(useShallow((s) => getYiruProfileSwitchLiveWorkSummary(s)))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [creating, setCreating] = useState(false)
  const [creatingCloudProfile, setCreatingCloudProfile] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [orgMembersOpen, setOrgMembersOpen] = useState(false)
  const [pendingSwitchProfileId, setPendingSwitchProfileId] = useState<string | null>(null)
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null,
    [activeProfileId, profiles]
  )
  const pendingSwitchProfile = useMemo(
    () => profiles.find((profile) => profile.id === pendingSwitchProfileId) ?? null,
    [pendingSwitchProfileId, profiles]
  )

  // Why: one attempt per mount — retrying on every loading toggle would spin
  // an unbounded IPC loop when the list call persistently fails.
  const fetchAttemptedRef = useRef(false)
  useEffect(() => {
    if (profiles.length === 0 && !loading && !fetchAttemptedRef.current) {
      fetchAttemptedRef.current = true
      void fetchProfiles()
    }
  }, [fetchProfiles, loading, profiles.length])

  // Why: the Yiru Cloud account UX isn't ready for production users yet, so the
  // trigger stays hidden in packaged builds. Dev builds still show it when cloud
  // auth is configured.
  if (import.meta.env.PROD) {
    return null
  }

  // Why: paired web/mobile clients only see the desktop stub's fabricated
  // profile list; showing a switcher there would misreport the active profile
  // and none of its actions can work remotely.
  if (isWebClient() || !activeProfile) {
    return null
  }

  // Why: with multi-profile UI downscoped, local-only builds (no cloud
  // configured) have nothing to offer in an account menu — show no trigger.
  if (!multiProfileUi && authStatus?.configured !== true) {
    return null
  }

  const handleCreateProfile = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (creating || switching) {
      return
    }
    setCreating(true)
    const profile = await createLocalProfile(newProfileName)
    setCreating(false)
    if (!profile) {
      return
    }
    setNewProfileName('')
    setDialogOpen(false)
    if (liveWorkSummary.hasLiveWork) {
      setPendingSwitchProfileId(profile.id)
      return
    }
    await switchProfile(profile.id)
  }

  const handleSwitchProfile = (profileId: string): void => {
    if (profileId === activeProfileId || switching) {
      return
    }
    if (liveWorkSummary.hasLiveWork) {
      setPendingSwitchProfileId(profileId)
      return
    }
    void switchProfile(profileId)
  }

  const handleConfirmSwitchProfile = (): void => {
    if (!pendingSwitchProfileId || switching) {
      return
    }
    void switchProfile(pendingSwitchProfileId)
  }

  const handleCreateCloudProfileForOrg = async (
    organization: YiruCloudOrgSummary
  ): Promise<void> => {
    if (creatingCloudProfile || switching) {
      return
    }
    setCreatingCloudProfile(true)
    const result = await createCloudLinkedProfile({
      orgId: organization.orgId,
      name: organization.name
    })
    setCreatingCloudProfile(false)
    if (result?.status !== 'created') {
      return
    }
    if (liveWorkSummary.hasLiveWork) {
      setPendingSwitchProfileId(result.profile.id)
      return
    }
    await switchProfile(result.profile.id)
  }

  const handleConfirmSignOut = async (): Promise<void> => {
    if (signingOut) {
      return
    }
    setSigningOut(true)
    const result = await signOutCurrentProfile()
    setSigningOut(false)
    if (result) {
      setSignOutConfirmOpen(false)
    }
  }

  const profileActionDisabled =
    switching || creating || creatingCloudProfile || connecting || signingOut
  // Why: teammate management needs a connected cloud profile scoped to an org;
  // the server enforces role permissions, and the dialog adapts via
  // canManageMembers, so cloud-linked + org + connected is enough to reveal it.
  const activeOrgId = activeProfile.cloud?.activeOrgId
  const showOrgMembers =
    activeProfile.kind === 'cloud-linked' &&
    Boolean(activeOrgId) &&
    authStatus?.state === 'connected'
  const sidebarPlacement = placement === 'sidebar'
  const triggerLabel = multiProfileUi
    ? translate('auto.components.yiru.profiles.switcher.4815f7d163', 'Switch profile')
    : translate('auto.components.yiru.profiles.switcher.account', 'Account')
  const accountIdentity = getYiruAccountIdentity(activeProfile, authStatus)
  const showAccountIdentity =
    multiProfileUi ||
    authStatus?.state === 'connected' ||
    authStatus?.state === 'reconnect-required'

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size={sidebarPlacement ? 'icon-xs' : 'xs'}
                    className={cn(
                      'shrink-0 text-muted-foreground [-webkit-app-region:no-drag]',
                      sidebarPlacement ? 'px-0' : 'mr-2 max-w-[180px] gap-1.5 px-1.5'
                    )}
                    disabled={profileActionDisabled}
                    aria-label={triggerLabel}
                  >
                    {sidebarPlacement && switching ? (
                      <LoadingIndicator className="size-3" />
                    ) : !multiProfileUi ? (
                      <CircleUserRound className="size-4" />
                    ) : (
                      <YiruProfileAvatar
                        profile={activeProfile}
                        className={
                          sidebarPlacement
                            ? 'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground size-4 text-[10px]'
                            : undefined
                        }
                      />
                    )}
                    {!sidebarPlacement ? (
                      <>
                        <span className="hidden max-w-[108px] truncate text-xs font-medium sm:inline">
                          {multiProfileUi
                            ? activeProfile.name
                            : showAccountIdentity
                              ? accountIdentity.title
                              : triggerLabel}
                        </span>
                        {switching ? <LoadingIndicator className="size-3" /> : <ChevronDown />}
                      </>
                    ) : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent side={sidebarPlacement ? 'top' : 'bottom'} sideOffset={6}>
            {triggerLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align={sidebarPlacement ? 'start' : 'end'}
          side={sidebarPlacement ? 'top' : 'bottom'}
          sideOffset={sidebarPlacement ? 8 : 6}
          className="w-64"
        >
          {showAccountIdentity ? (
            <>
              <YiruProfileMenuHeader
                profile={activeProfile}
                title={multiProfileUi ? activeProfile.name : accountIdentity.title}
                subtitle={
                  multiProfileUi ? getProfileSubtitle(activeProfile) : accountIdentity.subtitle
                }
                showProfileAvatar={multiProfileUi}
              />
              <DropdownMenuSeparator />
            </>
          ) : null}
          {multiProfileUi
            ? profiles.map((profile) => {
                const active = profile.id === activeProfileId
                return (
                  <DropdownMenuItem
                    key={profile.id}
                    disabled={profileActionDisabled}
                    onClick={() => handleSwitchProfile(profile.id)}
                    className="min-w-0"
                  >
                    <YiruProfileAvatar profile={profile} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{profile.name}</span>
                      <span className="text-muted-foreground block truncate text-[11px] font-normal">
                        {getProfileSubtitle(profile)}
                      </span>
                    </span>
                    {profile.kind === 'cloud-linked' ? <Cloud className="size-3.5" /> : <Laptop />}
                    {active && <Check className="text-foreground size-3.5" />}
                  </DropdownMenuItem>
                )
              })
            : null}
          {showOrgMembers ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={profileActionDisabled}
                onClick={() => setOrgMembersOpen(true)}
              >
                <Users />
                {translate(
                  'auto.components.yiru.profiles.switcher.org.members',
                  'Organization members'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
          <YiruProfileCloudMenuItems
            activeProfile={activeProfile}
            authStatus={authStatus}
            connecting={connecting}
            profileActionDisabled={profileActionDisabled}
            allowProfileCreation={multiProfileUi}
            separateAuthActions={showAccountIdentity || showOrgMembers}
            onConnect={() => {
              void connectCurrentProfile()
            }}
            onCreateProfileForOrg={(organization) => {
              void handleCreateCloudProfileForOrg(organization)
            }}
            onSelectOrg={(orgId) => {
              void selectOrg(orgId)
            }}
            onRequestSignOut={() => setSignOutConfirmOpen(true)}
          />
          {multiProfileUi ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={profileActionDisabled}
                onClick={() => {
                  setManagementOpen(true)
                }}
              >
                <Settings2 />
                {translate('auto.components.yiru.profiles.switcher.d00d853e2a', 'Manage profiles')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={profileActionDisabled}
                onClick={() => {
                  setDialogOpen(true)
                }}
              >
                <Plus />
                {translate(
                  'auto.components.yiru.profiles.switcher.c106c674fe',
                  'New local profile'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {multiProfileUi ? (
        <>
          <YiruProfileCreateDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            name={newProfileName}
            onNameChange={setNewProfileName}
            creating={creating}
            switching={switching}
            onSubmit={handleCreateProfile}
          />
          <YiruProfileManagementDialog
            open={managementOpen}
            onOpenChange={setManagementOpen}
            activeProfile={activeProfile}
            profiles={profiles}
          />
        </>
      ) : null}
      {showOrgMembers && activeOrgId ? (
        <YiruProfileOrgMembersDialog
          open={orgMembersOpen}
          onOpenChange={setOrgMembersOpen}
          orgId={activeOrgId}
          orgName={activeProfile.cloud?.activeOrgName}
          viewerUserId={activeProfile.cloud?.userId}
        />
      ) : null}
      <YiruProfileSignOutConfirmDialog
        open={signOutConfirmOpen}
        onOpenChange={(open) => {
          if (!signingOut) {
            setSignOutConfirmOpen(open)
          }
        }}
        onConfirm={() => {
          void handleConfirmSignOut()
        }}
        signingOut={signingOut}
      />
      {multiProfileUi ? (
        <YiruProfileSwitchConfirmDialog
          open={Boolean(pendingSwitchProfileId)}
          onOpenChange={(open) => {
            if (!open && !switching) {
              setPendingSwitchProfileId(null)
            }
          }}
          onConfirm={handleConfirmSwitchProfile}
          activeProfileName={activeProfile.name}
          targetProfile={pendingSwitchProfile}
          liveWorkSummary={liveWorkSummary}
          switching={switching}
        />
      ) : null}
    </>
  )
}
