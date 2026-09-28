import Link from 'next/link'
import { ExportLink } from '../../../components/admin-nav'
import { adminQuery, requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'
import { usd, when } from '../../../lib/admin-format'

type Developer = {
  id: string
  name: string
  emailMasked: string
  country: string
  createdAtMs: number
  signupMethod: string
  payoutMethod: string
  tools: string[]
  impressions: number
  earningsCents: number
  balanceCents: number
  lastActiveMs: number | null
  status: string
}

export default async function DevelopersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; status?: string; payout?: string; tool?: string; signup?: string; notice?: string; error?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ developers: Developer[] }>(adminQuery('/v1/admin/developers', query))
  const rows = body.ok ? body.data.developers : []
  const exportHref = adminQuery('/admin/export/developers', query)
  return (
    <main id="content">
      <div className="dash-top">
        <h1>Developers</h1>
        <ExportLink href={exportHref} />
      </div>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <form className="filters" method="get">
        <input name="q" defaultValue={query.q ?? ''} placeholder="Name or email" aria-label="Search developers" />
        <input name="country" defaultValue={query.country ?? ''} placeholder="Country" aria-label="Country" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select name="payout" defaultValue={query.payout ?? ''} aria-label="Payout method">
          <option value="">Any payout</option>
          <option value="upi">UPI</option>
          <option value="stripe">Stripe</option>
          <option value="crypto">Crypto</option>
          <option value="solana">Solana</option>
          <option value="api_credits">API credits</option>
        </select>
        <input name="tool" defaultValue={query.tool ?? ''} placeholder="Tool" aria-label="Tool" />
        <select name="signup" defaultValue={query.signup ?? ''} aria-label="Signup method">
          <option value="">Any signup</option>
          <option value="password">Password</option>
          <option value="magic_link">Email link</option>
          <option value="demo">Demo</option>
        </select>
        <button className="button secondary" type="submit">Filter</button>
      </form>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Country</th><th>Signed up</th><th>Method</th><th>Payout</th><th>Tools</th><th>Impr.</th><th>Earned</th><th>Balance</th><th>Last active</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={12}>No developers.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/admin/developers/${row.id}`}>{row.name}</Link></td>
                <td className="mono">{row.emailMasked}</td>
                <td>{row.country || '—'}</td>
                <td className="mono">{when(row.createdAtMs)}</td>
                <td>{row.signupMethod || '—'}</td>
                <td>{row.payoutMethod || '—'}</td>
                <td>{row.tools.length ? row.tools.join(', ') : '—'}</td>
                <td className="num">{row.impressions}</td>
                <td className="num">{usd(row.earningsCents)}</td>
                <td className="num">{usd(row.balanceCents)}</td>
                <td className="mono">{when(row.lastActiveMs)}</td>
                <td><span className={`badge ${row.status === 'suspended' ? 'rejected' : 'verified'}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
