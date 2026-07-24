import { describe, expect, it } from 'vite-plus/test'

import { cacheGitHubReleaseFeed, changelogFromUpdateInfo } from './updater-changelog'

describe('GitHub Release changelog mapping', () => {
  it('builds a text-only update card from the release notes already returned by the updater', () => {
    expect(
      changelogFromUpdateInfo({
        version: '1.2.3',
        releaseName: 'v1.2.3',
        releaseNotes:
          "<h2>What's Changed</h2><ul><li>Fix renderer crash recovery.</li><li>Add faster startup.</li></ul>"
      })
    ).toEqual({
      release: {
        title: 'Yiru 1.2.3',
        description: 'Fix renderer crash recovery.',
        releaseNotesUrl: 'https://github.com/xinyao27/yiru/releases/tag/v1.2.3'
      },
      releasesBehind: null
    })
  })

  it('uses the latest entry and counts all releases returned for a full changelog', () => {
    expect(
      changelogFromUpdateInfo({
        version: '2.0.0',
        releaseName: 'Yiru Desktop 2.0',
        releaseNotes: [
          { version: '2.0.0', note: 'Major workspace improvements.' },
          { version: '1.9.0', note: 'Previous release.' },
          { version: '1.8.0', note: null }
        ]
      })
    ).toEqual({
      release: {
        title: 'Yiru Desktop 2.0',
        description: 'Major workspace improvements.',
        releaseNotesUrl: 'https://github.com/xinyao27/yiru/releases/tag/v2.0.0'
      },
      releasesBehind: 3
    })
  })

  it('returns no rich changelog when GitHub supplied no useful notes', () => {
    expect(
      changelogFromUpdateInfo({
        version: '1.2.4',
        releaseName: 'v1.2.4',
        releaseNotes: "<h2>What's Changed</h2><p>Full Changelog:</p>"
      })
    ).toBeNull()
  })

  it('does not fail the update event on an invalid numeric HTML entity', () => {
    expect(
      changelogFromUpdateInfo({
        version: '1.2.5',
        releaseName: 'v1.2.5',
        releaseNotes: '<p>Fix release rendering &#99999999; safely.</p>'
      })
    ).toMatchObject({
      release: { description: 'Fix release rendering &#99999999; safely.' }
    })
  })

  it('uses the GitHub Releases Atom body when the generic updater manifest has no notes', () => {
    cacheGitHubReleaseFeed(`
      <feed>
        <entry>
          <link rel="alternate" href="https://github.com/xinyao27/yiru/releases/tag/v3.0.0"/>
          <title>Yiru Desktop 3.0</title>
          <content type="html">&lt;h2&gt;What's Changed&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Add direct release notes.&lt;/li&gt;&lt;/ul&gt;</content>
        </entry>
      </feed>
    `)

    expect(changelogFromUpdateInfo({ version: '3.0.0' })).toEqual({
      release: {
        title: 'Yiru Desktop 3.0',
        description: 'Add direct release notes.',
        releaseNotesUrl: 'https://github.com/xinyao27/yiru/releases/tag/v3.0.0'
      },
      releasesBehind: null
    })
  })
})
