import Link from 'next/link'
import { adminGet, money, qs, when, type Page } from '../lib'
import { CsvLink, Pager } from '../widgets'

type Developer = {
  id: string
  name: string
  email: string
  country: string
  signupAt: number
  signupMethod: string
  payoutMethod: string
  tools: string[]
  impressions: number
  verified: number
  earningsCents: number
  balanceCents: number
  lastActiveAt: number
  status: string
  payoutReviewed: boolean
}

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams
  const data = await adminGet<Page<Developer>>(`/v1/admin/developers${qs(query)}`)
  const href = (page: number) => `/admin/developers${qs({ ...query, page: String(page) })}`
  return (
    <main id="content">
      <p className="kicker">Users</p>
      <h1>Developers</h1>
      <form className="filters" action="/admin/developers">
        <input name="q" defaultValue={query.q ?? ''} aria-label="Search developers" placeholder="Name, email, tool" />
        <input name="country" defaultValue={query.country ?? ''} aria-label="Country" placeholder="Country" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deletion scheduled">Deletion scheduled</option>
        </select>
        <select name="payout" defaultValue={query.payout ?? ''} aria-label="Payout method">
          <option value="">Any payout</option>
          <option value="upi">UPI</option>
          <option value="stripe">Stripe</option>
          <option value="crypto">Crypto</option>
          <option value="api_credits">API credits</option>
        </select>
        <button className="button" type="submit">Filter</button>
        <CsvLink kind="developers" query={qs(query)} />
      </form>
      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Country</th><th>Signup</th><th>Method</th><th>Payout</th><th>Tools</th><th>Impressions</th><th>Earnings</th><th>Balance</th><th>Last active</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/admin/developers/${row.id}`}>{row.name}</Link></td>
                <td>{row.email}</td>
                <td>{row.country || '—'}</td>
                <td>{when(row.signupAt)}</td>
                <td>{row.signupMethod}</td>
                <td>{row.payoutMethod || '—'}</td>
                <td>{row.tools.join(', ') || '—'}</td>
                <td className="num">{row.verified}/{row.impressions}</td>
                <td className="num">{money(row.earningsCents)}</td>
                <td className="num">{money(row.balanceCents)}</td>
                <td>{when(row.lastActiveAt)}</td>
                <td>{row.status}{row.payoutReviewed ? ' · payout reviewed' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">No developers match.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={href} />
    </main>
  )
}
