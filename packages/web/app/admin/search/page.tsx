import Link from 'next/link'
import { adminGet, money } from '../lib'

type Hit = {
  developers: Array<{ id: string; name: string; email: string; country: string; status: string }>
  advertisers: Array<{ id: string; company: string; email: string; stage: string; spendCents: number }>
  leads: Array<{ id: string; source: string; name: string; email: string; status: string }>
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const data = q.trim() ? await adminGet<Hit>(`/v1/admin/search?q=${encodeURIComponent(q.trim())}`) : { developers: [], advertisers: [], leads: [] }
  return (
    <main id="content">
      <p className="kicker">Search</p>
      <h1>Results</h1>
      <form className="filters" action="/admin/search">
        <input name="q" defaultValue={q} aria-label="Search" />
        <button className="button" type="submit">Search</button>
      </form>
      {!q.trim() ? <p className="tiny">Search developers, advertisers, and leads.</p> : null}
      <section className="panel">
        <h2>Developers</h2>
        {data.developers.length === 0 ? <p className="tiny">None.</p> : (
          <ul>{data.developers.map((row) => <li key={row.id}><Link href={`/admin/developers/${row.id}`}>{row.name}</Link> · {row.email} · {row.country || 'no country'} · {row.status}</li>)}</ul>
        )}
        <h2>Advertisers</h2>
        {data.advertisers.length === 0 ? <p className="tiny">None.</p> : (
          <ul>{data.advertisers.map((row) => <li key={row.id}><Link href={`/admin/advertisers/${row.id}`}>{row.company}</Link> · {row.email} · {row.stage} · {money(row.spendCents)}</li>)}</ul>
        )}
        <h2>Leads</h2>
        {data.leads.length === 0 ? <p className="tiny">None.</p> : (
          <ul>{data.leads.map((row) => <li key={row.id}>{row.source} · {row.name || '—'} · {row.email} · {row.status}</li>)}</ul>
        )}
      </section>
    </main>
  )
}
