import { translate } from '@/i18n/i18n'

import type { YiruProfileAuthStatus, YiruProfileSummary } from '../../../../shared/yiru-profiles'

export function getYiruAccountIdentity(
  profile: YiruProfileSummary,
  authStatus: YiruProfileAuthStatus | null
): { title: string; subtitle: string } {
  // Why: the account-only menu must not present a local execution profile as
  // an authenticated Yiru identity.
  const cloud = authStatus?.cloud ?? profile.cloud
  if (authStatus?.state === 'connected') {
    return {
      title:
        cloud?.displayName?.trim() ||
        cloud?.email ||
        translate('auto.components.yiru.profiles.switcher.accountTitle', 'Yiru account'),
      subtitle:
        cloud?.activeOrgName ||
        (cloud?.displayName && cloud.email
          ? cloud.email
          : translate('auto.components.yiru.profiles.switcher.accountSignedIn', 'Signed in'))
    }
  }
  if (authStatus?.state === 'reconnect-required') {
    return {
      title:
        cloud?.displayName?.trim() ||
        cloud?.email ||
        translate('auto.components.yiru.profiles.switcher.accountTitle', 'Yiru account'),
      subtitle: translate(
        'auto.components.yiru.profiles.switcher.accountSignInRequired',
        'Sign-in required'
      )
    }
  }
  return {
    title: translate('auto.components.yiru.profiles.switcher.accountTitle', 'Yiru account'),
    subtitle: translate('auto.components.yiru.profiles.switcher.accountSignedOut', 'Signed out')
  }
}
