import type {
  YiruCloudCapabilities,
  YiruCloudOrgSummary,
  YiruProfileCloudSummary
} from '../../shared/yiru-profiles'

export type YiruCloudSessionExchangeResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  cloud: YiruProfileCloudSummary
  organizations?: YiruCloudOrgSummary[]
  capabilities: YiruCloudCapabilities
}
