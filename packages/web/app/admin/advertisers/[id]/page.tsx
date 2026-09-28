import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addNote, addTag, removeTag, saveAdvertiser } from '../../actions'
import { requireAdmin } from '../../../../lib/admin'
import { apiJson } from '../../../../lib/api'
import { day, usd, when } from '../../../../lib/admin-format'

type Detail = {
  id: string
  company: string
  contact: string
  email: string
  country: string
  status: string
  pipelineStage: string
  owner: string
  followUpAtMs: number | null
  spendCents: number
  blocksBought: number
  tags: string[]
  notes: Array<{ id: string; body: string; createdAtMs: number }>
  campaigns: Array<{
    id: string
    name: string
    adText: string
    destinationUrl: string
    surfaces: string[]
    placement: string
    countries: string[]
    maxBidCents: number
    spentCents: number
    budgetCents: number
    impressionCredits: number
    pace: string
    status: string
  }>
  invoices: Array<{ id: string; blocks: number; totalCents: number; status: string; provider: string; mode: string; createdAtMs: number; note: string }>
}

const STAGES: Array<[string, string]> = [
  ['lead', 'Lead'],
  ['contacted', 'Contacted'],
  ['onboarding', 'Onboarding'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['churned', 'Churned'],
]

export default async function AdvertiserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const query = await searchParams
  const body = await apiJson<Detail>(`/v1/admin/advertisers/${id}`)
  if (!body.ok) notFound()
  const row = body.data
  const back = `/admin/advertisers/${id}`
  return (
    <main id="content">
      <p className="tiny"><Link href="/admin/advertisers">Advertisers</Link></p>
      <div className="dash-top">
        <div>
          <h1>{row.company}</h1>
          <p className="who">{row.contact} · {row.email} · {row.country || 'No country'} · {row.status}</p>
        </div>
      </div>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      <section className="stats">
        <article className="stat"><b>{usd(row.spendCents)}</b><span>Spend</span></article>
        <article className="stat"><b>{row.blocksBought}</b><span>Blocks bought</span></article>
        <article className="stat"><b>{row.campaigns.length}</b><span>Campaigns</span></article>
        <article className="stat"><b>{row.pipelineStage}</b><span>Stage</span></article>
      </section>
      <div className="split">
        <section className="panel">
          <h2>Account</h2>
          <form action={saveAdvertiser}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="company">Company</label>
            <input id="company" name="company" defaultValue={row.company} />
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="owner" defaultValue={row.owner} />
            <label htmlFor="stage">Pipeline stage</label>
            <select id="stage" name="pipelineStage" defaultValue={row.pipelineStage}>
              {STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label htmlFor="follow">Follow-up</label>
            <input id="follow" name="followUpAt" type="date" defaultValue={row.followUpAtMs ? day(row.followUpAtMs) : ''} />
            <button className="button" type="submit">Save</button>
          </form>
          <h2>Tags</h2>
          <div className="inline">
            {row.tags.length === 0 ? <span className="tiny">No tags.</span> : row.tags.map((tag) => (
              <form key={tag} action={removeTag}>
                <input type="hidden" name="subjectType" value="advertiser" />
                <input type="hidden" name="subjectId" value={row.id} />
                <input type="hidden" name="tag" value={tag} />
                <input type="hidden" name="back" value={back} />
                <button className="badge" type="submit">{tag} ×</button>
              </form>
            ))}
          </div>
          <form action={addTag}>
            <input type="hidden" name="subjectType" value="advertiser" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="ad-tag">Add tag</label>
            <input id="ad-tag" name="tag" />
            <button className="button secondary" type="submit">Add tag</button>
          </form>
          <h2>Notes</h2>
          {row.notes.length === 0 ? <p>No notes.</p> : row.notes.map((note) => (
            <p key={note.id}><span className="tiny mono">{when(note.createdAtMs)}</span><br />{note.body}</p>
          ))}
          <form action={addNote}>
            <input type="hidden" name="subjectType" value="advertiser" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="ad-note">Add note</label>
            <textarea id="ad-note" name="body" required maxLength={2000} />
            <button className="button" type="submit">Save note</button>
          </form>
        </section>
        <section className="panel">
          <h2>Campaigns</h2>
          {row.campaigns.length === 0 ? <p>No campaigns.</p> : row.campaigns.map((campaign) => (
            <article key={campaign.id} className="card" style={{ marginBottom: '0.6rem' }}>
              <h3>{campaign.name}</h3>
              <p>{campaign.adText}</p>
              <p className="tiny">
                {campaign.destinationUrl ? <a href={campaign.destinationUrl}>{campaign.destinationUrl}</a> : 'No link'}
                {' · '}{campaign.placement} · {campaign.surfaces.join(', ') || 'no tools'} · {campaign.countries.join(', ') || 'everywhere'}
              </p>
              <p className="tiny">Bid {usd(campaign.maxBidCents)} · spent {usd(campaign.spentCents)} of {usd(campaign.budgetCents)} · {campaign.impressionCredits} credits · {campaign.pace} · {campaign.status}</p>
            </article>
          ))}
          <h2>Invoices</h2>
          <p className="tiny">Mock invoices from checkout rows. No tax document is generated.</p>
          {row.invoices.length === 0 ? <p>No invoices.</p> : (
            <table className="admin-table">
              <thead><tr><th>When</th><th>Blocks</th><th>Total</th><th>Status</th><th>Provider</th></tr></thead>
              <tbody>
                {row.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="mono">{when(invoice.createdAtMs)}</td>
                    <td className="num">{invoice.blocks}</td>
                    <td className="num">{usd(invoice.totalCents)}</td>
                    <td>{invoice.status} · {invoice.mode}</td>
                    <td>{invoice.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  )
}
