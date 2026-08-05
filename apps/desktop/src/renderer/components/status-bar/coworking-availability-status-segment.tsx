import {
  UsersThree,
  WarningCircle,
  ArrowClockwise as RefreshCw,
  ShieldCheck
} from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import {
  projectCoworkingAvailabilityDiagnostic,
  type CoworkingAvailabilityDiagnostic
} from '~renderer/components/coworking/availability-diagnostic'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { Button } from '~renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '~renderer/components/ui/tooltip'
import { useMountedRef } from '~renderer/hooks/use-mounted-ref'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type { CoworkingPublicationSuspensionReason } from '~shared/coworking/publication-suspension'
import { COWORKING_INGRESS_PORT } from '~shared/coworking/wire-contract'

import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './context-menu-policy'

export function CoworkingAvailabilityStatusSegment(): React.JSX.Element | null {
  const status = useAppStore((state) => state.coworkingSharingStatus)
  const rawDiagnostic = useAppStore((state) => state.coworkingSharingDiagnostic)
  const diagnostic = projectCoworkingAvailabilityDiagnostic(status, rawDiagnostic)

  // Why: unmounting the disclosure when availability recovers ensures a later
  // failure starts collapsed and only reveals details after a fresh click.
  if (diagnostic) {
    return <CoworkingAvailabilityStatusSegmentContent key={diagnostic} diagnostic={diagnostic} />
  }
  // Why: a firewall-blocked desktop reports 'unavailable' but is deliberately
  // excluded from the diagnostic projection, so it has no reachable state here
  // and must not masquerade as a healthy listener.
  return status === 'unavailable' ? null : <CoworkingPresenceStatusSegment status={status} />
}

/** Live presence: whether the tailnet listener is up and who is on it. */
function CoworkingPresenceStatusSegment({
  status
}: {
  status: 'starting' | 'ready'
}): React.JSX.Element {
  // Why: the sharing snapshot arrives whole on every catalog change, so the
  // always-mounted trigger reads counts only. The peer arrays are read by the
  // popover body, which exists solely while it is open.
  const connectionCount = useAppStore((state) => state.coworkingOwnerActiveConnections.length)
  const pendingCount = useAppStore(
    (state) =>
      state.coworkingControlRequestQueue.length + state.coworkingHostAccessRequestQueue.length
  )
  const sharedCount = useAppStore(
    (state) =>
      state.coworkingOwnerWorktrees.filter((worktree) => worktree.visibility === 'public').length
  )
  const [open, setOpen] = useState(false)

  const label = getPresenceLabel({ status, connectionCount, pendingCount })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="status-bar-quiet"
                    size="status-bar"
                    {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
                    className="text-[11px] font-medium"
                    aria-label={label}
                    aria-expanded={open}
                  >
                    <UsersThree
                      className={
                        connectionCount > 0 ? 'size-3 text-sky-500' : 'text-muted-foreground size-3'
                      }
                      weight={connectionCount > 0 ? 'fill' : 'regular'}
                    />
                    {/* Why: DESIGN.md requires status to read without colour, so
                        an active session always carries its count as text. */}
                    {connectionCount > 0 ? <span>{connectionCount}</span> : null}
                    {pendingCount > 0 ? <span className="text-amber-500">!</span> : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-border flex flex-col gap-0.5 border-b px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <UsersThree className="size-3.5 shrink-0" />
            <span>{label}</span>
          </div>
          <CoworkingSelfIdentityLine />
        </div>
        <CoworkingPresenceDetails sharedCount={sharedCount} />
      </PopoverContent>
    </Popover>
  )
}

function CoworkingSelfIdentityLine(): React.JSX.Element | null {
  const self = useAppStore((state) => state.coworkingSelfIdentity)
  if (!self) {
    return null
  }
  return (
    <span className="text-muted-foreground text-[11px] leading-4">
      {translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.sharingAs',
        'Sharing as {{node}}',
        { node: self.nodeDisplayName }
      )}
    </span>
  )
}

function CoworkingPresenceDetails({ sharedCount }: { sharedCount: number }): React.JSX.Element {
  const connections = useAppStore((state) => state.coworkingOwnerActiveConnections)
  const ownerWorktrees = useAppStore((state) => state.coworkingOwnerWorktrees)
  // Why: returning filter() from the selector creates an uncached snapshot and
  // makes React loop when the popover subscribes during its initial mount.
  // Why: a suspended share still reads as public in the sidebar, so without this
  // the owner believes they are sharing something no peer can actually open.
  const suspended = ownerWorktrees.filter((worktree) => worktree.publicationStatus === 'suspended')

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <p className="text-muted-foreground text-xs leading-5">
        {sharedCount > 0
          ? translate(
              'auto.components.coworking.CoworkingAvailabilityStatusSegment.sharedWorktrees',
              '{{count}} worktree(s) published to your tailnet.',
              { count: sharedCount }
            )
          : translate(
              'auto.components.coworking.CoworkingAvailabilityStatusSegment.noSharedWorktrees',
              'No worktrees are published. Peers cannot see anything yet.'
            )}
      </p>
      {suspended.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {suspended.map((worktree) => (
            <li
              key={worktree.worktreeId}
              className="flex min-w-0 items-center gap-2 text-xs leading-5"
            >
              <WarningCircle className="size-3 shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1 truncate">{worktree.displayName}</span>
              <span className="text-muted-foreground shrink-0">
                {getSuspensionLabel(worktree.suspensionReason)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {connections.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {connections.map((connection) => (
            <li
              key={connection.connectionId}
              className="flex min-w-0 items-center gap-2 text-xs leading-5"
            >
              <span className="min-w-0 flex-1 truncate">
                {connection.requester.userDisplayName || connection.requester.nodeDisplayName}
              </span>
              {connection.hasControl ? (
                <span className="text-muted-foreground flex shrink-0 items-center gap-1">
                  <ShieldCheck className="size-3" />
                  {translate(
                    'auto.components.coworking.CoworkingAvailabilityStatusSegment.hasControl',
                    'Can edit'
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground shrink-0">
                  {translate(
                    'auto.components.coworking.CoworkingAvailabilityStatusSegment.readOnly',
                    'Read-only'
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function getSuspensionLabel(reason: CoworkingPublicationSuspensionReason | undefined): string {
  switch (reason) {
    case 'host-unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.suspendedHostUnavailable',
        'Host offline'
      )
    case 'incarnation-unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.suspendedIncarnation',
        'Worktree replaced'
      )
    case 'overlapping-root':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.suspendedOverlapping',
        'Overlapping share'
      )
    case undefined:
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.suspendedUnknown',
        'Not served'
      )
  }
}

function getPresenceLabel(state: {
  status: 'starting' | 'ready'
  connectionCount: number
  pendingCount: number
}): string {
  if (state.status === 'starting') {
    return translate(
      'auto.components.coworking.CoworkingAvailabilityStatusSegment.starting',
      'Coworking is starting…'
    )
  }
  if (state.pendingCount > 0) {
    return translate(
      'auto.components.coworking.CoworkingAvailabilityStatusSegment.pendingRequests',
      '{{count}} peer(s) waiting for your approval',
      { count: state.pendingCount }
    )
  }
  if (state.connectionCount > 0) {
    return translate(
      'auto.components.coworking.CoworkingAvailabilityStatusSegment.peersConnected',
      '{{count}} peer(s) connected',
      { count: state.connectionCount }
    )
  }
  return translate(
    'auto.components.coworking.CoworkingAvailabilityStatusSegment.readyIdle',
    'Coworking ready · no one connected'
  )
}

function CoworkingAvailabilityStatusSegmentContent({
  diagnostic
}: {
  diagnostic: CoworkingAvailabilityDiagnostic
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const retryInFlightRef = useRef(false)
  const mountedRef = useMountedRef()

  const title = translate(
    'auto.components.coworking.CoworkingAvailabilityStatusSegment.title',
    'Coworking is unavailable'
  )

  // Why: a blocked firewall rule cannot be cleared by re-probing, so that one
  // diagnostic offers the repair the Coworking panel notice would have run.
  const needsFirewallRepair = diagnostic === 'coworking_windows_firewall_unavailable'

  async function recover(): Promise<void> {
    if (retryInFlightRef.current) {
      return
    }
    retryInFlightRef.current = true
    setRetrying(true)
    try {
      await (needsFirewallRepair
        ? window.api.coworkingSharing.repairWindowsFirewall()
        : window.api.coworkingSharing.retryAvailability())
    } catch {
      // Why: keep host-sensitive Electron errors out of the UI; the sanitized
      // diagnostic remains visible as the recovery feedback.
    } finally {
      retryInFlightRef.current = false
      if (mountedRef.current) {
        setRetrying(false)
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="status-bar-quiet"
            size="status-bar"
            {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
            className="text-[11px] font-medium"
            aria-label={title}
            aria-expanded={open}
          >
            <WarningCircle className="size-3 text-amber-500" />
            <span>{title}</span>
          </Button>
        }
      />

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-80 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="border-border flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium">
          <WarningCircle className="size-3.5 shrink-0 text-amber-500" />
          <span>{title}</span>
        </div>
        <div className="px-3 py-3">
          <p className="text-muted-foreground text-xs leading-5">
            {getAvailabilityDescription(diagnostic)}
          </p>
          <div className="mt-3 flex justify-end">
            <Button type="button" size="xs" disabled={retrying} onClick={() => void recover()}>
              {retrying ? <LoadingIndicator /> : <RefreshCw />}
              {retrying
                ? translate(
                    'auto.components.coworking.CoworkingAvailabilityStatusSegment.checking',
                    'Checking…'
                  )
                : needsFirewallRepair
                  ? translate(
                      'auto.components.coworking.CoworkingAvailabilityStatusSegment.repairFirewall',
                      'Repair firewall rule'
                    )
                  : translate(
                      'auto.components.coworking.CoworkingAvailabilityStatusSegment.checkAgain',
                      'Check again'
                    )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getAvailabilityDescription(diagnostic: CoworkingAvailabilityDiagnostic): string {
  switch (diagnostic) {
    case 'tailscale_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleUnavailable',
        'Tailscale could not be found on this desktop.'
      )
    case 'tailscale_not-running':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleNotRunning',
        'Tailscale is installed, but its service is not running.'
      )
    case 'tailscale_permission-denied':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscalePermissionDenied',
        'Yiru does not have permission to read Tailscale status.'
      )
    case 'tailscale_timed-out':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleTimedOut',
        'Tailscale did not respond in time. Coworking will keep checking.'
      )
    case 'tailscale_unsupported-output':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.tailscaleUnsupportedOutput',
        'Tailscale returned status data that this Yiru version cannot read.'
      )
    case 'coworking_port_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.portUnavailable',
        'TCP port {{port}} is already in use. Close the conflicting process; Coworking will keep checking.',
        { port: COWORKING_INGRESS_PORT }
      )
    case 'coworking_permission_denied':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.permissionDenied',
        'System permissions prevented Yiru from opening the Coworking Tailnet listener.'
      )
    case 'persistence_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.persistenceUnavailable',
        'Coworking could not safely load sharing settings, so sharing remains off.'
      )
    case 'coworking_windows_firewall_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.windowsFirewallUnavailable',
        'Windows Firewall is blocking the Coworking listener on TCP port {{port}}.',
        { port: COWORKING_INGRESS_PORT }
      )
    case 'coworking_unavailable':
      return translate(
        'auto.components.coworking.CoworkingAvailabilityStatusSegment.unavailable',
        'Coworking could not start on this desktop.'
      )
  }
}
