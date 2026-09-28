import Link from 'next/link'
import { ExportLink } from '../../../components/admin-nav'
import { adminQuery, requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'
import { usd, when } from '../../../lib/admin-format'

type Campaign = {
  id: string
  name: string
  advertiser: string
  advertiserId: string
  status: string
  adText: string
  maxBidCents: number
  spentCents: number
  budgetCents: number
  surfaces: string[]
  placement: string
  countries: string[]
  pace: string
  createdAtMs: number
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ campaigns: Campaign[] }>(adminQuery('/v1/admin/campaigns', query))
  const rows = body.ok ? body.data.campaigns : []
  return (
    <main id="content">
      <div className="dash-top">
        <h1>Campaigns</h1>
        <ExportLink href={adminQuery('/admin/export/campaigns', query)} />
      </div>
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <form className="filters" method="get">
        <input name="q" defaultValue={query.q ?? ''} placeholder="Name, advertiser, or ad line" aria-label="Search campaigns" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Campaign status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <button className="button secondary" type="submit">Filter</button>
      </form>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Advertiser</th><th>Status</th><th>Ad line</th><th>Bid</th><th>Spent</th><th>Tools</th><th>Targeting</th><th>Pace</th><th>Created</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={10}>No campaigns.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td><Link href={`/admin/advertisers/${row.advertiserId}`}>{row.advertiser}</Link></td>
                <td>{row.status}</td>
                <td>{row.adText}</td>
                <td className="num">{usd(row.maxBidCents)}</td>
                <td className="num">{usd(row.spentCents)} / {usd(row.budgetCents)}</td>
                <td>{row.surfaces.join(', ')}</td>
                <td>{row.placement}{row.countries.length ? ` · ${row.countries.join(', ')}` : ''}</td>
                <td>{row.pace}</td>
                <td className="mono">{when(row.createdAtMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
