import { translate } from '@/i18n/i18n'

import {
  YIRU_ANDROID_LATEST_APK_URL,
  YIRU_IOS_TESTFLIGHT_URL
} from '../../../../shared/yiru-mobile-downloads'

export type MobilePlatform = 'ios' | 'android'
export type MobileReleaseLink = { ctaLabel: string; url: string }

export function getMobileReleaseLink(platform: MobilePlatform): MobileReleaseLink {
  if (platform === 'ios') {
    return {
      ctaLabel: translate(
        'auto.components.mobile.mobile.platform.copy.testflight.cta',
        'Open TestFlight'
      ),
      url: YIRU_IOS_TESTFLIGHT_URL
    }
  }

  return {
    ctaLabel: translate('auto.components.mobile.mobile.platform.copy.android.cta', 'Download APK'),
    url: YIRU_ANDROID_LATEST_APK_URL
  }
}
