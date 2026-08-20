export type CoworkingWindowsFirewallStatus =
  | { supported: false }
  | {
      supported: true
      port: number
      ruleAllowed: boolean
      inspectionAvailable: boolean
    }

export type CoworkingWindowsFirewallRepairResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }
