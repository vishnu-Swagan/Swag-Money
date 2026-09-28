import Link from 'next/link'
import { adminGet, qs, type Page } from '../../lib'
import { CsvLink, Pager } from '../../widgets'

type TablePage = Page<Record<string, string>> & { title: string; columns: string[] }

export default async function DatabaseTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { table } = await params
  const query = await searchParams
  const data = await adminGet<TablePage>(`/v1/admin/database/${table}${qs({ page: query.page })}`)
  return (
    <main id="content">
      <p className="kicker"><Link href="/admin/database">Database</Link></p>
      <h1>{data.title}</h1>
      <p className="filters"><CsvLink kind={table} query={qs({ page: query.page })} /></p>
      <div className="panel">
        <table className="admin-table">
          <thead>
            <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.id ?? row.userId ?? String(index)}>
                {data.columns.map((column) => <td key={column}>{row[column]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 ? <p className="tiny">No rows.</p> : null}
      </div>
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} href={(page) => `/admin/database/${table}${qs({ page: String(page) })}`} />
    </main>
  )
}
