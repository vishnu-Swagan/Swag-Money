import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'

type HitDeveloper = { id: string; name: string; emailMasked: string; country: string; status: string }
type HitAdvertiser = { id: string; company: string; contact: string; emailMasked: string; pipelineLabel: string }
type HitLead = { id: string; kind: string; name: string; emailMasked: string; summary: string; status: string }
type Results = { developers: HitDeveloper[]; advertisers: HitAdvertiser[]; leads: HitLead[] }

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireAdmin()
  const query = await searchParams
  const q = query.q?.trim() ?? ''
  const body = q.length >= 2 ? await apiJson<Results>(`/v1/admin/search?q=${encodeURIComponent(q)}`) : null
  const data = body?.ok ? body.data : { developers: [], advertisers: [], leads: [] }
  return (
    <main id="content">
      <h1>Search</h1>
      <form className="filters" action="/admin/search" method="get">
        <input name="q" defaultValue={q} placeholder="At least two characters" aria-label="Search" />
        <button className="button" type="submit">Search</button>
      </form>
      {q.length > 0 && q.length < 2 ? <p>Type at least two characters.</p> : null}
      {body && !body.ok ? <p className="banner error">{body.error}</p> : null}
      <section className="panel">
        <h2>Developers</h2>
        {data.developers.length === 0 ? <p>None.</p> : (
          <ul>
            {data.developers.map((row) => (
              <li key={row.id}><Link href={`/admin/developers/${row.id}`}>{row.name}</Link> · <span className="mono">{row.emailMasked}</span> · {row.country || '—'} · {row.status}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>Advertisers</h2>
        {data.advertisers.length === 0 ? <p>None.</p> : (
          <ul>
            {data.advertisers.map((row) => (
              <li key={row.id}><Link href={`/admin/advertisers/${row.id}`}>{row.company}</Link> · {row.contact} · <span className="mono">{row.emailMasked}</span> · {row.pipelineLabel}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>Leads</h2>
        {data.leads.length === 0 ? <p>None.</p> : (
          <ul>
            {data.leads.map((row) => (
              <li key={row.id}><Link href={`/admin/leads/${row.id}`}>{row.name || row.kind}</Link> · {row.kind} · <span className="mono">{row.emailMasked}</span> · {row.status}<br />{row.summary}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
