import type { CoworkingOsFamily } from '~shared/coworking/wire-contract'

import { loadOrCreateCoworkingE2EEKeypair } from '../e2ee-keypair'
import { CoworkingProbeService } from '../ingress-probe'
import { CoworkingOwnerCatalog } from '../owner/catalog'
import { HttpCoworkingProbeClient } from '../probe-client'
import { DefaultTailnetPeerDirectory } from '../tailnet-peer-directory'
import { TailscaleCommandAdapter } from '../tailscale-command-adapter'
import { CoworkingTicketAuthority } from '../ticket-authority'
import type { CoworkingWindowsFirewallEnvironment } from '../windows-firewall'

export type CoworkingPeerConnectivityOptions = {
  userDataPath: string
  ownerRuntimeId: string
  yiruVersion: string
  osFamily: CoworkingOsFamily
  isPackaged: boolean
  executablePath: string
}

// Why: tailnet discovery, peer probing, E2EE identity, and access tickets are
// the substrate ingress and the owner catalog both depend on — one surface an
// owner instance assembles once, independent of how RPC/session wiring changes.
export function createCoworkingPeerConnectivity(options: CoworkingPeerConnectivityOptions) {
  const tailnet = new TailscaleCommandAdapter()
  const keypair = loadOrCreateCoworkingE2EEKeypair(options.userDataPath)
  const tickets = new CoworkingTicketAuthority()
  const probe = new CoworkingProbeService({
    tailnet,
    tickets,
    keypair,
    ownerRuntimeId: options.ownerRuntimeId,
    yiruVersion: options.yiruVersion,
    osFamily: options.osFamily
  })
  const probeClient = new HttpCoworkingProbeClient()
  const ownerCatalog = new CoworkingOwnerCatalog(
    new DefaultTailnetPeerDirectory(tailnet, probeClient),
    probeClient
  )
  const firewallEnvironment: CoworkingWindowsFirewallEnvironment = {
    platform: process.platform,
    isPackaged: options.isPackaged,
    executablePath: options.executablePath,
    systemRoot: process.env.SystemRoot
  }
  return { tailnet, keypair, tickets, probe, probeClient, ownerCatalog, firewallEnvironment }
}
