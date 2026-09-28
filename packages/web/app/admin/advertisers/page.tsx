import Link from 'next/link'
import { savePipeline } from '../actions'
import { adminGet, money, qs, when, type Page } from '../lib'
import { CsvLink, Pager } from '../widgets'

const STAGES = ['lead', 'contacted', 'onboarding', 'active', 'paused', 'churned'] as const
const LABELS: Record<(typeof STAGES)[number], string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  churned: 'Churned',
}

type Advertiser = {
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
}

export default async function AdvertisersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams
  const view = query.view === 'kanban' ? 'kanban' : 'table'
  const data = view === 'table'
    ? await adminGet<Page<Advertiser>>(`/v1/admin/advertisers${qs(query)}`)
    : null
  const board = view === 'kanban' ? await everyAdvertiser(query) : []
  return (
    <main id="content">
      <p className="kicker">Sales</p>
      <h1>Advertisers</h1>
      <p className="filters">
        <Link className="button secondary" href={`/admin/advertisers${qs({ ...query, view: undefined })}`} aria-current={view === 'table' ? 'page' : undefined}>Table</Link>
        <Link className="button secondary" href={`/admin/advertisers${qs({ ...query, view: 'kanban', page: undefined })}`} aria-current={view === 'kanban' ? 'page' : undefined}>Kanban</Link>
        <CsvLink kind="advertisers" query={qs(query)} />
      </p>
      <form className="filters" action="/admin/advertisers">
        {view === 'kanban' ? <input type="hidden" name="view" value="kanban" /> : null}
        <input name="q" defaultValue={query.q ?? ''} aria-label="Search advertisers" placeholder="Company, contact, email" />
        <select name="stage" defaultValue={query.stage ?? ''} aria-label="Stage">
          <option value="">Any stage</option>
          {STAGES.map((stage) => <option key={stage} value={stage}>{LABELS[stage]}</option>)}
        </select>
        <button className="button" type="submit">Filter</button>
      </form>
      {view === 'kanban' ? <Kanban rows={board} back={`/admin/advertisers${qs({ ...query, view: 'kanban' })}`} /> : data ? <Table data={data} query={query} /> : null}
    </main>
  )
}

async function everyAdvertiser(query: Record<string, string | undefined>): Promise<Advertiser[]> {
  const first = await adminGet<Page<Advertiser>>(`/v1/admin/advertisers${qs({ ...query, page: '1' })}`)
  const rows = [...first.rows]
  const pages = Math.ceil(first.total / first.pageSize)
  for (let page = 2; page <= pages; page += 1) {
    const next = await adminGet<Page<Advertiser>>(`/v1/admin/advertisers${qs({ ...query, page: String(page) })}`)
    rows.push(...next.rows)
  }
  return rows
}

function Table({ data, query }: { data: Page<Advertiser>; query: Record<string, string | undefined> }) {
  return (
    <>
      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Company</th><th>Contact</th><th>Email</th><th>Country</th><th>Stage</th><th>Campaigns</th><th>Spend</th><th>Blocks</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/admin/advertisers/${row.id}`}>{row.company}</Link></td>
                <td>{row.contact}</td>
                <td>{row.email}</td>
                <td>{row.country || '—'}</td>
                <td>{LABELS[row.stage]}</td>
                <td className="num">{row.campaigns}</td>
                <td className="num">{money(row.spendCents)}</td>
                <td className="num">{row.blocks}</td>
                <td>{row.status}</td>
                <td>{when(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">No advertisers match.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={(page) => `/admin/advertisers${qs({ ...query, page: String(page) })}`} />
    </>
  )
}

function Kanban({ rows, back }: { rows: Advertiser[]; back: string }) {
  return (
    <div className="kanban">
      {STAGES.map((stage) => (
        <section key={stage} aria-label={LABELS[stage]}>
          <h2>{LABELS[stage]}</h2>
          {rows.filter((row) => row.stage === stage).map((row) => (
            <article key={row.id}>
              <Link href={`/admin/advertisers/${row.id}`}><strong>{row.company}</strong></Link>
              <p className="tiny">{row.contact} · {row.email}<br />{money(row.spendCents)} · follow-up {when(row.followUpAt)}</p>
              <form action={savePipeline}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="back" value={back} />
                <label className="tiny" htmlFor={`stage-${row.id}`}>Move</label>
                <select id={`stage-${row.id}`} name="stage" defaultValue={row.stage}>
                  {STAGES.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}
                </select>
                <button className="button secondary" type="submit">Save stage</button>
              </form>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
