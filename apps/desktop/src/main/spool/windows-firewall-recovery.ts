import type {
  SpoolWindowsFirewallRepairResult,
  SpoolWindowsFirewallStatus
} from '../../shared/spool/spool-windows-firewall-contract'

export type SpoolWindowsFirewallOperations = {
  inspect: () => Promise<SpoolWindowsFirewallStatus>
  repair: () => Promise<SpoolWindowsFirewallRepairResult>
}

export class SpoolWindowsFirewallRecovery {
  private repairInFlight: Promise<SpoolWindowsFirewallRepairResult> | null = null

  constructor(
    private readonly firewall: SpoolWindowsFirewallOperations | undefined,
    private readonly canRepair: () => boolean,
    private readonly recover: () => Promise<void>
  ) {}

  inspect(): Promise<SpoolWindowsFirewallStatus> {
    return this.firewall?.inspect() ?? Promise.resolve({ supported: false })
  }

  repair(): Promise<SpoolWindowsFirewallRepairResult> {
    if (this.repairInFlight) {
      return this.repairInFlight
    }
    const operation = this.runRepair().finally(() => {
      if (this.repairInFlight === operation) {
        this.repairInFlight = null
      }
    })
    this.repairInFlight = operation
    return operation
  }

  private async runRepair(): Promise<SpoolWindowsFirewallRepairResult> {
    if (!this.canRepair() || !this.firewall) {
      return { ok: false, reason: 'unsupported' }
    }
    const result = await this.firewall.repair()
    if (result.ok) {
      await this.recover()
    }
    return result
  }
}
