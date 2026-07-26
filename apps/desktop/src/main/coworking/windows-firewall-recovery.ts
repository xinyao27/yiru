import type {
  CoworkingWindowsFirewallRepairResult,
  CoworkingWindowsFirewallStatus
} from '../../shared/coworking/windows-firewall-contract'

export type CoworkingWindowsFirewallOperations = {
  inspect: () => Promise<CoworkingWindowsFirewallStatus>
  repair: () => Promise<CoworkingWindowsFirewallRepairResult>
}

export class CoworkingWindowsFirewallRecovery {
  private repairInFlight: Promise<CoworkingWindowsFirewallRepairResult> | null = null

  constructor(
    private readonly firewall: CoworkingWindowsFirewallOperations | undefined,
    private readonly canRepair: () => boolean,
    private readonly recover: () => Promise<void>
  ) {}

  inspect(): Promise<CoworkingWindowsFirewallStatus> {
    return this.firewall?.inspect() ?? Promise.resolve({ supported: false })
  }

  repair(): Promise<CoworkingWindowsFirewallRepairResult> {
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

  private async runRepair(): Promise<CoworkingWindowsFirewallRepairResult> {
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
