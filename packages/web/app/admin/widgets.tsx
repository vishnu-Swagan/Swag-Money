import Link from 'next/link'

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <article className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </article>
  )
}

export function Pager({ page, total, pageSize, href }: { page: number; total: number; pageSize: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <p className="pager tiny">
      {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span>Previous</span>}
      <span>Page {page} of {pages} · {total} rows</span>
      {page < pages ? <Link href={href(page + 1)}>Next</Link> : <span>Next</span>}
    </p>
  )
}

export function CsvLink({ kind, query = '' }: { kind: string; query?: string }) {
  return (
    <a className="button secondary" href={`/admin/export/${kind}${query}`}>Download CSV</a>
  )
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null
  return <p className="banner error" role="alert">{message}</p>
}

export function SignupChart({ series }: { series: Array<{ day: string; developers: number; advertisers: number }> }) {
  const max = Math.max(1, ...series.map((day) => day.developers + day.advertisers))
  return (
    <div>
      <div className="bars" aria-hidden="true">
        {series.map((day) => (
          <span key={day.day} title={`${day.day}: ${day.developers} developers, ${day.advertisers} advertisers`}>
            <i className="ads" style={{ height: `${(day.advertisers / max) * 100}%` }} />
            <i className="dev" style={{ height: `${(day.developers / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <p className="tiny">Last 30 days. Lime is developers, amber is advertisers. {series[0]?.day} to {series.at(-1)?.day}.</p>
    </div>
  )
}
