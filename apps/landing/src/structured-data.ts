import { canonicalUrl, SITE_ORIGIN } from './routes'
import type { RouteMeta } from './routes'
import { faqEntries } from './ui/faq/questions'

/**
 * Why: returned as objects, not as `<script>` strings. `head().meta` accepts a
 * `script:ld+json` entry and serialises it itself, so this goes out through the same
 * mechanism as the rest of the head and the build no longer has to splice HTML.
 *
 * The FAQ block quotes the same array the page renders. Google treats structured data
 * that disagrees with the visible text as spam, and a second copy of eight paragraphs
 * guarantees one of them drifts. The product entity belongs on the homepage only, not
 * on every document that shares the shell.
 */
const publisher = {
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#publisher`,
  name: 'Yiru',
  url: `${SITE_ORIGIN}/`,
  logo: `${SITE_ORIGIN}/favicon.png`,
  sameAs: ['https://github.com/xinyao27/yiru', 'https://github.com/xinyao27']
}

const website = {
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  url: `${SITE_ORIGIN}/`,
  name: 'Yiru',
  inLanguage: 'en',
  publisher: { '@id': publisher['@id'] }
}

// Why: no aggregateRating. There is no rating data to state, and a fabricated one is
// rich-result spam. No version number either — nothing here may go stale.
const application = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE_ORIGIN}/#app`,
  name: 'Yiru',
  alternateName: 'Yiru AI agent editor IDE',
  description:
    'An open-source AI agent editor IDE that runs Claude Code, Codex, and any CLI coding agent in isolated git worktrees across local, WSL, SSH, and relay-connected hosts.',
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Integrated Development Environment',
  operatingSystem: 'macOS, Windows, Linux, iOS',
  url: `${SITE_ORIGIN}/`,
  image: `${SITE_ORIGIN}/og.jpg`,
  downloadUrl: 'https://github.com/xinyao27/yiru/releases/latest',
  license: 'https://github.com/xinyao27/yiru/blob/main/LICENSE',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Runs Claude Code, Codex, and any CLI coding agent',
    'One isolated git worktree per agent session',
    'Local, WSL, SSH, and relay-connected hosts',
    'Review diffs and merge from an iOS companion app',
    'Open source under the MIT license'
  ],
  publisher: { '@id': publisher['@id'] }
}

export function productGraph(): object {
  return { '@context': 'https://schema.org', '@graph': [website, publisher, application] }
}

export function faqGraph(meta: RouteMeta): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      website,
      publisher,
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl(meta)}#faq`,
        url: canonicalUrl(meta),
        name: meta.title,
        isPartOf: { '@id': website['@id'] },
        mainEntity: faqEntries.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer }
        }))
      }
    ]
  }
}
