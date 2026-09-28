import Link from 'next/link'
import { ExportLink } from '../../../components/admin-nav'
import { reviewPayout } from '../actions'
import { adminQuery, requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'
import { usd, when } from '../../../lib/admin-format'

type Payout = {
  id: string
  userId: string
  developer: string
  provider: string
  amountCents: number
  status: string
  destinationMasked: string
  mode: string
  reviewed: boolean
  createdAtMs: number
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; provider?: string; reviewed?: string; notice?: string; error?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ payouts: Payout[] }>(adminQuery('/v1/admin/payouts', query))
  const rows = body.ok ? body.data.payouts : []
  return (
    <main id="content">
      <div className="dash-top">
        <h1>Payouts</h1>
        <ExportLink href={adminQuery('/admin/export/payouts', query)} />
      </div>
      <p className="tiny">Destinations are masked. Open the developer for the full UPI id or wallet.</p>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <form className="filters" method="get">
        <select name="status" defaultValue={query.status ?? ''} aria-label="Payout status">
          <option value="">Any status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
        <select name="provider" defaultValue={query.provider ?? ''} aria-label="Provider">
          <option value="">Any provider</option>
          <option value="upi">UPI</option>
          <option value="solana">Solana</option>
          <option value="stripe_connect">Stripe</option>
          <option value="lightning">Lightning</option>
          <option value="api_credits">API credits</option>
        </select>
        <select name="reviewed" defaultValue={query.reviewed ?? ''} aria-label="Reviewed">
          <option value="">Reviewed or not</option>
          <option value="yes">Reviewed</option>
          <option value="no">Not reviewed</option>
        </select>
        <button className="button secondary" type="submit">Filter</button>
      </form>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Developer</th><th>Provider</th><th>Amount</th><th>Status</th><th>Destination</th><th>Mode</th><th>Reviewed</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={9}>No payouts.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{when(row.createdAtMs)}</td>
                <td><Link href={`/admin/developers/${row.userId}`}>{row.developer}</Link></td>
                <td>{row.provider}</td>
                <td className="num">{usd(row.amountCents)}</td>
                <td>{row.status}</td>
                <td className="mono">{row.destinationMasked}</td>
                <td>{row.mode}</td>
                <td>{row.reviewed ? 'Yes' : 'No'}</td>
                <td>
                  {row.reviewed ? null : (
                    <form action={reviewPayout}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="back" value="/admin/payouts" />
                      <button className="button secondary" type="submit">Mark reviewed</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
