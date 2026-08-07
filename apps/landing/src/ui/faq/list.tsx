import { faqEntries } from './questions'

/**
 * Why: a plain definition list rather than disclosure widgets. Collapsed answers
 * are still indexed, but they are one more thing to style, to make keyboard
 * accessible, and to get wrong — and this page's whole argument is that it does
 * not need interaction to say what the product is.
 */
export function Faq(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-7">
      <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">Questions</h2>
      <dl className="flex flex-col gap-7">
        {faqEntries.map((entry) => (
          <div key={entry.question} className="flex flex-col gap-3">
            <dt className="text-label max-w-[620px] font-medium">{entry.question}</dt>
            <dd className="max-w-[620px]">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
