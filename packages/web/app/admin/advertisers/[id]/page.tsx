import Link from 'next/link'
import { addNote, addTag, savePipeline } from '../../actions'
import { adminGet, money, when } from '../../lib'
import { ErrorBanner } from '../../widgets'

const STAGES = ['lead', 'contacted', 'onboarding', 'active', 'paused', 'churned'] as const

type Detail = {
  id: string
  company: string
  contact: string
  email: string
  country: string
  campaigns: number
  spendCents: number
  blocks: number
  status: string
  stage: (typeof STAGES)[number]
  ownerEmail: string
  followUpAt: number | null
  createdAt: number
  notes: Array<{ id: string; body: string; at: number }>
  tags: string[]
  campaignRows: Array<{
    id: string
    name: string
    status: string
    adText: string
    destinationUrl: string
    placement: string
    countries: string[]
    surfaces: string[]
    maxBidCents: number
    budgetCents: number
    spentCents: number
    pace: string
    impressionCredits: number
    createdAtMs: number
  }>
  invoices: Array<{
    id: string
    blocks: number
    totalCents: number
    status: string
    provider: string
    mode: string
    emailInvoice: boolean
    mock: boolean
    createdAtMs: number
  }>
}

export default async function AdvertiserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const row = await adminGet<Detail>(`/v1/admin/advertisers/${id}`)
  const back = `/admin/advertisers/${id}`
  const follow = row.followUpAt ? new Date(row.followUpAt).toISOString().slice(0, 10) : ''
  return (
    <main id="content">
      <p className="kicker"><Link href="/admin/advertisers">Advertisers</Link></p>
      <h1>{row.company}</h1>
      <ErrorBanner message={query.error} />
      <p className="who">{row.contact} · {row.email} · {row.country || 'No country'} · {row.status} · created {when(row.createdAt)}</p>
      <section className="stats">
        <article className="stat"><b>{row.campaigns}</b><span>Campaigns</span></article>
        <article className="stat"><b>{money(row.spendCents)}</b><span>Spend</span></article>
        <article className="stat"><b>{row.blocks}</b><span>Blocks bought</span></article>
      </section>
      <div className="split">
        <section className="panel">
          <h2>Campaigns</h2>
          {row.campaignRows.length === 0 ? <p className="tiny">No campaigns yet.</p> : row.campaignRows.map((campaign) => (
            <article key={campaign.id}>
              <h3>{campaign.name} <span className="badge">{campaign.status}</span></h3>
              <p>{campaign.adText}</p>
              <p className="tiny">
                {campaign.destinationUrl || 'No link'} · {campaign.placement} · {campaign.surfaces.join(', ') || 'no surface'} · {campaign.countries.join(', ') || 'everywhere'} · pace {campaign.pace}
                <br />
                Bid {money(campaign.maxBidCents)} · budget {money(campaign.budgetCents)} · spent {money(campaign.spentCents)} · credits {campaign.impressionCredits}
              </p>
            </article>
          ))}
          <h2>Invoices</h2>
          <p className="tiny">Checkout in this build is mocked. These rows are the recorded charges, not tax invoices, and no mail is sent.</p>
          {row.invoices.length === 0 ? <p className="tiny">None.</p> : (
            <table className="admin-table">
              <thead><tr><th>When</th><th>Blocks</th><th>Total</th><th>Mode</th><th>Status</th></tr></thead>
              <tbody>
                {row.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{when(invoice.createdAtMs)}</td>
                    <td>{invoice.blocks}</td>
                    <td>{money(invoice.totalCents)}</td>
                    <td>{invoice.mock ? 'mock' : invoice.mode}{invoice.emailInvoice ? ' · invoice requested' : ''}</td>
                    <td>{invoice.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <h2>Pipeline</h2>
          <form action={savePipeline}>
            <input type="hidden" name="id" value={row.id} />
            <label htmlFor="stage">Stage</label>
            <select id="stage" name="stage" defaultValue={row.stage}>
              {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="ownerEmail" defaultValue={row.ownerEmail} placeholder="email" />
            <label htmlFor="follow">Follow-up</label>
            <input id="follow" name="followUpAt" type="date" defaultValue={follow} />
            <button className="button" type="submit">Save pipeline</button>
          </form>
          <h2>Tags</h2>
          <p>{row.tags.map((tag) => <span key={tag} className="badge">{tag} </span>)}</p>
          <form action={addTag} className="inline">
            <input type="hidden" name="subjectType" value="advertiser" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <input name="tag" aria-label="Tag" placeholder="Tag" />
            <button className="button secondary" type="submit">Add tag</button>
          </form>
          <h2>Notes</h2>
          <ul>{row.notes.map((note) => <li key={note.id}><span className="tiny">{when(note.at)}</span><br />{note.body}</li>)}</ul>
          <form action={addNote}>
            <input type="hidden" name="subjectType" value="advertiser" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="note">Add a note</label>
            <textarea id="note" name="body" required />
            <button className="button" type="submit">Save note</button>
          </form>
        </section>
      </div>
    </main>
  )
}
