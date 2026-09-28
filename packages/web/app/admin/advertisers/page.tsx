import Link from 'next/link'
import { ExportLink } from '../../../components/admin-nav'
import { adminQuery, requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'
import { usd, when } from '../../../lib/admin-format'

type Advertiser = {
  id: string
  company: string
  contact: string
  emailMasked: string
  country: string
  campaigns: number
  spendCents: number
  blocksBought: number
  status: string
  pipelineStage: string
  pipelineLabel: string
  createdAtMs: number
}

const STAGES = ['lead', 'contacted', 'onboarding', 'active', 'paused', 'churned']

export default async function AdvertisersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; status?: string; country?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ advertisers: Advertiser[] }>(adminQuery('/v1/admin/advertisers', query))
  const rows = body.ok ? body.data.advertisers : []
  return (
    <main id="content">
      <div className="dash-top">
        <div>
          <h1>Advertisers</h1>
          <p className="tiny"><Link href="/admin/advertisers/board">Pipeline board</Link></p>
        </div>
        <ExportLink href={adminQuery('/admin/export/advertisers', query)} />
      </div>
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <form className="filters" method="get">
        <input name="q" defaultValue={query.q ?? ''} placeholder="Company, contact, or email" aria-label="Search advertisers" />
        <select name="stage" defaultValue={query.stage ?? ''} aria-label="Pipeline stage">
          <option value="">Any stage</option>
          {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <select name="status" defaultValue={query.status ?? ''} aria-label="Account status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <input name="country" defaultValue={query.country ?? ''} placeholder="Country" aria-label="Country" />
        <button className="button secondary" type="submit">Filter</button>
      </form>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Company</th><th>Contact</th><th>Email</th><th>Country</th><th>Campaigns</th><th>Spend</th><th>Blocks</th><th>Status</th><th>Stage</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={10}>No advertisers yet.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/admin/advertisers/${row.id}`}>{row.company}</Link></td>
                <td>{row.contact}</td>
                <td className="mono">{row.emailMasked}</td>
                <td>{row.country || '—'}</td>
                <td className="num">{row.campaigns}</td>
                <td className="num">{usd(row.spendCents)}</td>
                <td className="num">{row.blocksBought}</td>
                <td>{row.status}</td>
                <td>{row.pipelineLabel}</td>
                <td className="mono">{when(row.createdAtMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
