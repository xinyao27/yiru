import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import type { YiruProfileIndex } from '../../shared/yiru-profiles'
import { getYiruProfileDirectory, getYiruProfilesDirectory } from './profile-storage-paths'

export function purgeLegacyCloudProfileFiles(index: YiruProfileIndex, userDataPath: string): void {
  const profileIds = new Set(index.profiles.map((profile) => profile.id))
  try {
    for (const entry of readdirSync(getYiruProfilesDirectory(userDataPath), {
      withFileTypes: true
    })) {
      if (entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(entry.name)) {
        profileIds.add(entry.name)
      }
    }
  } catch {
    // The profiles directory may not exist yet on a fresh install.
  }

  for (const profileId of profileIds) {
    try {
      // Why: login and sign-out no longer exist, so retained access/refresh
      // tokens would otherwise have no user-visible deletion path.
      const profileDirectory = getYiruProfileDirectory(profileId, userDataPath)
      rmSync(join(profileDirectory, 'account-session.json.enc'), { force: true })
      rmSync(join(profileDirectory, 'account-session-mutation.json'), { force: true })
    } catch {
      // Retry on the next startup without blocking access to local profile data.
    }
  }
}
