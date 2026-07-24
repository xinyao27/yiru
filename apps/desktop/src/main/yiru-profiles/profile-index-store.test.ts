import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { ensureActiveYiruProfile } from './profile-index-store'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('legacy cloud profile migration', () => {
  it('preserves local profile data while removing account credentials and metadata', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'yiru-cloud-profile-migration-'))
    temporaryRoots.push(userDataPath)
    const profileId = 'legacy-cloud-profile'
    const profileDirectory = join(userDataPath, 'profiles', profileId)
    const indexPath = join(userDataPath, 'yiru-profile-index.json')
    const profile = {
      id: profileId,
      name: 'Legacy profile',
      avatar: { kind: 'initials', initials: 'L', color: 'neutral' },
      kind: 'cloud-linked',
      cloud: { userId: 'user-1', organizationId: 'org-1' },
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3
    }
    const index = { schemaVersion: 1, activeProfileId: profileId, profiles: [profile] }

    mkdirSync(profileDirectory, { recursive: true })
    writeFileSync(indexPath, JSON.stringify(index))
    writeFileSync(`${indexPath}.bak`, JSON.stringify(index))
    writeFileSync(join(profileDirectory, 'account-session.json.enc'), 'encrypted-tokens')
    writeFileSync(join(profileDirectory, 'account-session-mutation.json'), 'cloud-identity')
    writeFileSync(join(profileDirectory, 'yiru-data.json'), '{"projects":["kept"]}')

    const active = ensureActiveYiruProfile(userDataPath)

    expect(active.profile).toMatchObject({ id: profileId, kind: 'local' })
    expect(existsSync(join(profileDirectory, 'account-session.json.enc'))).toBe(false)
    expect(existsSync(join(profileDirectory, 'account-session-mutation.json'))).toBe(false)
    expect(readFileSync(join(profileDirectory, 'yiru-data.json'), 'utf8')).toContain('kept')
    for (const persistedPath of [indexPath, `${indexPath}.bak`]) {
      const persisted = readFileSync(persistedPath, 'utf8')
      expect(persisted).not.toContain('cloud-linked')
      expect(persisted).not.toContain('organizationId')
      expect(JSON.parse(persisted).profiles[0]).toMatchObject({ id: profileId, kind: 'local' })
    }
  })
})
