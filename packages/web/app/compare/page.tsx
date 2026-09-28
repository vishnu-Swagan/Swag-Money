import Link from 'next/link'
import { SiteFooter, SiteNav } from '../../components/nav'
import { COMPARE_NOTE, COMPARE_ROWS, MARKETPLACE_NOTE } from '../../lib/compare'
import { apiJson } from '../../lib/api'

export const dynamic = 'force-dynamic'

export default async function ComparePage() {
  const me = await apiJson<{ role: string }>('/v1/me')
  return (
    <>
      <SiteNav current="compare" signedIn={me.ok} />
      <main id="content" className="wrap page-pad">
        <p className="kicker">As of September 2026</p>
        <h1>Swag-Money vs Kickbacks.ai</h1>
        <p className="dek">
          A factual comparison from public pages, the published extension package, and third-party security reviews.
          Swag-Money’s column is this repository, not a claim of live traffic or completed payouts.
        </p>
        <div className="compare-board">
          {COMPARE_ROWS.map((row) => (
            <article key={row.id} id={row.id}>
              <h2>{row.topic}</h2>
              <div>
                <h3>Kickbacks.ai today</h3>
                <p>{row.kickbacks}</p>
                <a href={row.sourceHref}>{row.sourceLabel}</a>
                {row.id === 'signing' ? (
                  <p><a href="https://dariusjdavis.com/blog/kickbacks-ai-reverse-engineering/">Earlier empty-key review</a></p>
                ) : null}
                {row.id === 'method' ? (
                  <p><a href="https://go-to-agency.com/en/blog/kickbacks-security-review-empty-signing-key">Second security review</a></p>
                ) : null}
              </div>
              <div>
                <h3>Swag-Money</h3>
                <p>{row.swag}</p>
                {row.id === 'coverage' ? <p><Link href="/integrations">Integrations directory</Link></p> : null}
              </div>
            </article>
          ))}
        </div>
        <p className="tiny">
          {MARKETPLACE_NOTE.text}{' '}
          <a href={MARKETPLACE_NOTE.href}>{MARKETPLACE_NOTE.label}</a>
        </p>
        <p className="tiny">{COMPARE_NOTE}</p>
      </main>
      <SiteFooter />
    </>
  )
}
