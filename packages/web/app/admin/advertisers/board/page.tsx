import Link from 'next/link'
import { saveAdvertiser } from '../../actions'
import { requireAdmin } from '../../../../lib/admin'
import { apiJson } from '../../../../lib/api'
import { day, usd } from '../../../../lib/admin-format'

type Advertiser = {
  id: string
  company: string
  contact: string
  emailMasked: string
  spendCents: number
  pipelineStage: string
  owner: string
  followUpAtMs: number | null
}

const STAGES: Array<[string, string]> = [
  ['lead', 'Lead'],
  ['contacted', 'Contacted'],
  ['onboarding', 'Onboarding'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['churned', 'Churned'],
]

export default async function AdvertiserBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ advertisers: Advertiser[] }>('/v1/admin/advertisers')
  const rows = body.ok ? body.data.advertisers : []
  return (
    <main id="content">
      <div className="dash-top">
        <div>
          <h1>Pipeline</h1>
          <p className="tiny"><Link href="/admin/advertisers">Table</Link></p>
        </div>
      </div>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <div className="kanban">
        {STAGES.map(([stage, label]) => {
          const cards = rows.filter((row) => row.pipelineStage === stage)
          return (
            <section key={stage}>
              <h2>{label} <span className="tiny">{cards.length}</span></h2>
              {cards.length === 0 ? <p className="tiny">Empty</p> : cards.map((card) => (
                <article key={card.id} className="card">
                  <h3><Link href={`/admin/advertisers/${card.id}`}>{card.company}</Link></h3>
                  <p>{card.contact}<br /><span className="mono">{card.emailMasked}</span></p>
                  <p className="tiny">{usd(card.spendCents)} spend · {card.owner || 'No owner'} · follow-up {day(card.followUpAtMs)}</p>
                  <form action={saveAdvertiser}>
                    <input type="hidden" name="id" value={card.id} />
                    <input type="hidden" name="owner" value={card.owner} />
                    <input type="hidden" name="company" value={card.company} />
                    <input type="hidden" name="followUpAt" value={card.followUpAtMs ? day(card.followUpAtMs) : ''} />
                    <input type="hidden" name="back" value="/admin/advertisers/board" />
                    <label className="sr" htmlFor={`stage-${card.id}`}>Move {card.company}</label>
                    <select id={`stage-${card.id}`} name="pipelineStage" defaultValue={card.pipelineStage}>
                      {STAGES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                    </select>
                    <button className="button secondary" type="submit">Move</button>
                  </form>
                </article>
              ))}
            </section>
          )
        })}
      </div>
    </main>
  )
}
