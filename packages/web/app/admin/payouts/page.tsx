import { adminGet, money, qs, when, type Page } from '../lib'
import { CsvLink, Pager } from '../widgets'

type Payout = {
  id: string
  developer: string
  email: string
  provider: string
  mode: string
  amountCents: number
  destination: string
  status: string
  createdAt: number
}

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams
  const data = await adminGet<Page<Payout>>(`/v1/admin/payouts${qs(query)}`)
  return (
    <main id="content">
      <p className="kicker">Money</p>
      <h1>Payouts</h1>
      <p className="sub">Destinations are masked here. Open the developer for the full value. Transfers in this build are mock or sandbox.</p>
      <form className="filters" action="/admin/payouts">
        <input name="q" defaultValue={query.q ?? ''} aria-label="Search payouts" placeholder="Developer" />
        <select name="provider" defaultValue={query.provider ?? ''} aria-label="Provider">
          <option value="">Any provider</option>
          <option value="stripe_connect">Stripe</option>
          <option value="solana">Solana</option>
          <option value="lightning">Lightning</option>
          <option value="upi">UPI</option>
          <option value="api_credits">API credits</option>
        </select>
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <button className="button" type="submit">Filter</button>
        <CsvLink kind="payouts" query={qs(query)} />
      </form>
      <div className="panel">
        <table className="admin-table">
          <thead><tr><th>When</th><th>Developer</th><th>Email</th><th>Provider</th><th>Amount</th><th>Destination</th><th>Status</th></tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>{when(row.createdAt)}</td>
                <td>{row.developer}</td>
                <td>{row.email}</td>
                <td>{row.provider} · {row.mode}</td>
                <td className="num">{money(row.amountCents)}</td>
                <td>{row.destination}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">No payouts.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={(page) => `/admin/payouts${qs({ ...query, page: String(page) })}`} />
    </main>
  )
}
