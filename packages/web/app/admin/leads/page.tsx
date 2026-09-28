import { setLeadStatus } from '../actions'
import { adminGet, qs, when, type Page } from '../lib'
import { CsvLink, ErrorBanner, Pager } from '../widgets'

const STATUSES = ['new', 'reviewed', 'replied', 'spam'] as const

type Lead = {
  id: string
  source: string
  name: string
  email: string
  topic: string
  body: string
  status: string
  createdAt: number
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams
  const data = await adminGet<Page<Lead>>(`/v1/admin/leads${qs(query)}`)
  return (
    <main id="content">
      <p className="kicker">Inbox</p>
      <h1>Signups and leads</h1>
      <p className="sub">Newest first. Signups, the contact form, advertiser enquiries, and privacy requests land here.</p>
      <ErrorBanner message={query.error} />
      <form className="filters" action="/admin/leads">
        <input name="q" defaultValue={query.q ?? ''} aria-label="Search leads" placeholder="Search" />
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select name="source" defaultValue={query.source ?? ''} aria-label="Source">
          <option value="">Any source</option>
          <option value="signup">Signup</option>
          <option value="contact">Contact</option>
          <option value="advertiser_form">Advertiser form</option>
          <option value="privacy">Privacy request</option>
        </select>
        <button className="button" type="submit">Filter</button>
        <CsvLink kind="leads" query={qs(query)} />
      </form>
      <div className="panel">
        <table className="admin-table">
          <thead><tr><th>When</th><th>Source</th><th>Name</th><th>Email</th><th>Topic</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>{when(row.createdAt)}</td>
                <td>{row.source}</td>
                <td>{row.name || '—'}</td>
                <td>{row.email}</td>
                <td>{row.topic}</td>
                <td className="wrap-cell">{row.body || '—'}</td>
                <td>
                  <form action={setLeadStatus} className="inline">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="back" value={`/admin/leads${qs(query)}`} />
                    <select name="status" defaultValue={row.status} aria-label={`Status for ${row.email}`}>
                      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    <button className="button secondary" type="submit">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">Inbox is empty.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={(page) => `/admin/leads${qs({ ...query, page: String(page) })}`} />
    </main>
  )
}
