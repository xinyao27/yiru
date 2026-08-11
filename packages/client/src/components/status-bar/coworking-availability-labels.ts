import { translate } from '~renderer/i18n/i18n'
import type { CoworkingPublicationSuspensionReason } from '~shared/coworking/publication-suspension'
import { COWORKING_INGRESS_PORT } from '~shared/coworking/wire-contract'

import type { CoworkingAvailabilityDiagnostic } from '../coworking/availability-diagnostic'

export function getSuspensionLabel(
  reason: CoworkingPublicationSuspensionReason | undefined
): string {
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

export function getPresenceLabel(state: {
  status: 'starting' | 'ready'
  connectionCount: number
  pendingCount: number
  remoteDesktopCount: number
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
  if (state.remoteDesktopCount > 0) {
    return translate(
      'auto.components.coworking.CoworkingAvailabilityStatusSegment.remoteHostsAvailable',
      '{{count}} remote host(s) available',
      { count: state.remoteDesktopCount }
    )
  }
  return translate(
    'auto.components.coworking.CoworkingAvailabilityStatusSegment.readyIdle',
    'Coworking ready · no one connected'
  )
}

export function getAvailabilityDescription(diagnostic: CoworkingAvailabilityDiagnostic): string {
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
