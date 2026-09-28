import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '../../../../lib/admin'
import { apiJson } from '../../../../lib/api'

type Page = {
  name: string
  page: number
  pageSize: number
  total: number
  pages: number
  columns: string[]
  rows: Array<Record<string, unknown>>
}

export default async function DatabaseTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>
  searchParams: Promise<{ page?: string }>
}) {
  await requireAdmin()
  const { table } = await params
  const query = await searchParams
  const page = query.page && /^\d+$/.test(query.page) ? query.page : '1'
  const body = await apiJson<Page>(`/v1/admin/database/${table}?page=${page}`)
  if (!body.ok) notFound()
  const data = body.data
  return (
    <main id="content">
      <p className="tiny"><Link href="/admin/database">Database</Link></p>
      <div className="dash-top">
        <div>
          <h1 className="mono">{data.name}</h1>
          <p className="who">{data.total} rows · page {data.page} of {data.pages}</p>
        </div>
        <a className="button secondary" href={`/admin/export/table?name=${data.name}`}>CSV</a>
      </div>
      <p className="tiny">Secrets stay redacted. Emails and payout destinations stay masked. There is no SQL box.</p>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={Math.max(1, data.columns.length)}>No rows.</td></tr>
            ) : data.rows.map((row, index) => (
              <tr key={String(row.id ?? row.version ?? index)}>
                {data.columns.map((column) => (
                  <td key={column} className="mono">{formatCell(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="inline">
        {data.page > 1 ? <Link href={`/admin/database/${data.name}?page=${data.page - 1}`}>Previous</Link> : <span>Previous</span>}
        {data.page < data.pages ? <Link href={`/admin/database/${data.name}?page=${data.page + 1}`}>Next</Link> : <span>Next</span>}
      </p>
    </main>
  )
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
