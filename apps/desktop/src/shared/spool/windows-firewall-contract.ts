export type SpoolWindowsFirewallStatus =
  | { supported: false }
  | {
      supported: true
      port: number
      ruleAllowed: boolean
      inspectionAvailable: boolean
    }

export type SpoolWindowsFirewallRepairResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }
