import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'

export type ShellBrowserCookieImportSummary = {
  totalCookies: number
  importedCookies: number
  skippedCookies: number
  domains: string[]
}

export type ShellBrowserCookieImportResult =
  | { ok: true; profileId: string; summary: ShellBrowserCookieImportSummary }
  | { ok: false; reason: string }

const SHELL_HOST_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

export const shellBrowserContract = {
  importCookies: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ profileId: string }>())
    .output(type<ShellBrowserCookieImportResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>
