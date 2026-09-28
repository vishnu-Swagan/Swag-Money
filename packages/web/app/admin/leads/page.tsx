import Link from 'next/link'
import { ExportLink } from '../../../components/admin-nav'
import { setLeadStatus } from '../actions'
import { adminQuery, requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'
import { when } from '../../../lib/admin-format'

type Lead = {
  id: string
  kind: string
  name: string
  emailMasked: string
  company: string
  country: string
  summary: string
  status: string
  createdAtMs: number
}

const STATUSES = ['new', 'reviewed', 'replied', 'spam']

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; notice?: string; error?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const body = await apiJson<{ leads: Lead[] }>(adminQuery('/v1/admin/leads', { status: query.status }))
  const rows = body.ok ? body.data.leads : []
  return (
    <main id="content">
      <div className="dash-top">
        <h1>Leads</h1>
        <ExportLink href={adminQuery('/admin/export/leads', { status: query.status })} />
      </div>
      <p className="tiny">Signups, contact form, advertiser checkout, and privacy requests. Newest first. Emails are masked here.</p>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      {!body.ok ? <p className="banner error">{body.error}</p> : null}
      <form className="filters" method="get">
        <select name="status" defaultValue={query.status ?? ''} aria-label="Lead status">
          <option value="">All statuses</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <button className="button secondary" type="submit">Filter</button>
      </form>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Kind</th><th>Name</th><th>Email</th><th>Summary</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}>The inbox is empty.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                <td className="mono">{when(row.createdAtMs)}</td>
                <td>{row.kind}</td>
                <td><Link href={`/admin/leads/${row.id}`}>{row.name || '—'}</Link></td>
                <td className="mono">{row.emailMasked || '—'}</td>
                <td className="summary">{row.summary}</td>
                <td><span className="badge">{row.status}</span></td>
                <td>
                  <div className="inline">
                    {STATUSES.filter((status) => status !== row.status).map((status) => (
                      <form key={status} action={setLeadStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value={status} />
                        <input type="hidden" name="back" value="/admin/leads" />
                        <button className="button secondary" type="submit">{status}</button>
                      </form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
