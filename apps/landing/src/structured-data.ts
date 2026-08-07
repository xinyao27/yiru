import { faqEntries } from './ui/faq/questions'

/**
 * Why: the FAQPage block is generated from the same array the page renders rather
 * than hand-written beside the other JSON-LD in index.html. Structured data that
 * disagrees with the visible answer is a manual-action risk, and a second copy of
 * eight paragraphs is a guarantee that one of them drifts.
 *
 * It is injected into the built document by apps/landing/scripts/prerender.mjs,
 * because a crawler reading the page without JavaScript has to see it in the HTML.
 */
export function renderFaqStructuredData(): string {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': 'https://yiru.ai/#faq',
    mainEntity: faqEntries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer }
    }))
  }

  // Why: `</script>` inside a JSON string would close this block early. The
  // answers are prose today, but that is a property of the copy, not a guarantee.
  const json = JSON.stringify(payload, null, 2).replaceAll('</', '<\\/')
  return `<script type="application/ld+json">\n${json}\n</script>`
}
