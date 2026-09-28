import { adminGet, money, qs, when, type Page } from '../lib'
import { CsvLink, Pager } from '../widgets'

type Campaign = {
  id: string
  name: string
  company: string
  email: string
  status: string
  surfaces: string[]
  maxBidCents: number
  budgetCents: number
  spentCents: number
  verified: number
  createdAt: number
}

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams
  const data = await adminGet<Page<Campaign>>(`/v1/admin/campaigns${qs(query)}`)
  return (
    <main id="content">
      <p className="kicker">Delivery</p>
      <h1>Campaigns</h1>
      <form className="filters" action="/admin/campaigns">
        <input name="q" defaultValue={query.q ?? ''} aria-label="Search campaigns" placeholder="Name or company" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <button className="button" type="submit">Filter</button>
        <CsvLink kind="campaigns" query={qs(query)} />
      </form>
      <div className="panel">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Status</th><th>Surfaces</th><th>Bid</th><th>Budget</th><th>Spent</th><th>Verified</th><th>Created</th></tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.company}</td>
                <td>{row.email}</td>
                <td>{row.status}</td>
                <td>{row.surfaces.join(', ')}</td>
                <td className="num">{money(row.maxBidCents)}</td>
                <td className="num">{money(row.budgetCents)}</td>
                <td className="num">{money(row.spentCents)}</td>
                <td className="num">{row.verified}</td>
                <td>{when(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">No campaigns.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={(page) => `/admin/campaigns${qs({ ...query, page: String(page) })}`} />
    </main>
  )
}
