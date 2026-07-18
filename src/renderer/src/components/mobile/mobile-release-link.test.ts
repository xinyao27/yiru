import { describe, expect, it, vi } from 'vite-plus/test'
import {
  YIRU_ANDROID_LATEST_APK_URL,
  YIRU_IOS_TESTFLIGHT_URL
} from '../../../../shared/yiru-mobile-downloads'
import { getMobileReleaseLink } from './mobile-release-link'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

describe('getMobileReleaseLink', () => {
  it('returns the TestFlight public link for iOS', () => {
    expect(getMobileReleaseLink('ios')).toEqual({
      ctaLabel: 'Open TestFlight',
      url: YIRU_IOS_TESTFLIGHT_URL
    })
  })

  it('returns the rolling APK link for Android', () => {
    expect(getMobileReleaseLink('android')).toEqual({
      ctaLabel: 'Download APK',
      url: YIRU_ANDROID_LATEST_APK_URL
    })
  })
})
