import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addNote, setLeadStatus } from '../../actions'
import { requireAdmin } from '../../../../lib/admin'
import { apiJson } from '../../../../lib/api'
import { when } from '../../../../lib/admin-format'

type Lead = {
  id: string
  kind: string
  name: string
  email: string
  company: string
  country: string
  summary: string
  status: string
  createdAtMs: number
  notes: Array<{ id: string; body: string; createdAtMs: number }>
}

const STATUSES = ['new', 'reviewed', 'replied', 'spam']

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const query = await searchParams
  const body = await apiJson<Lead>(`/v1/admin/leads/${id}`)
  if (!body.ok) notFound()
  const row = body.data
  const back = `/admin/leads/${id}`
  return (
    <main id="content">
      <p className="tiny"><Link href="/admin/leads">Leads</Link></p>
      <h1>{row.name || row.kind}</h1>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      <section className="panel">
        <p>{row.email || 'No email'} · {row.company || 'No company'} · {row.country || 'No country'}</p>
        <p><span className="badge">{row.kind}</span> <span className="badge">{row.status}</span> <span className="tiny mono">{when(row.createdAtMs)}</span></p>
        <p>{row.summary}</p>
        <div className="inline">
          {STATUSES.filter((status) => status !== row.status).map((status) => (
            <form key={status} action={setLeadStatus}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="back" value={back} />
              <button className="button secondary" type="submit">{status}</button>
            </form>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Notes</h2>
        {row.notes.length === 0 ? <p>No notes.</p> : row.notes.map((note) => <p key={note.id}>{note.body}</p>)}
        <form action={addNote}>
          <input type="hidden" name="subjectType" value="lead" />
          <input type="hidden" name="subjectId" value={row.id} />
          <input type="hidden" name="back" value={back} />
          <label htmlFor="lead-note">Add note</label>
          <textarea id="lead-note" name="body" required maxLength={2000} />
          <button className="button" type="submit">Save note</button>
        </form>
      </section>
    </main>
  )
}
