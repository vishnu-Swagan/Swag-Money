import Link from 'next/link'
import { requireAdmin } from '../../../lib/admin'
import { apiJson } from '../../../lib/api'

type Catalog = { ok: boolean; migrationVersion: string; tables: Array<{ name: string; rows: number }> }

export default async function DatabasePage() {
  await requireAdmin()
  const body = await apiJson<Catalog>('/v1/admin/database')
  if (!body.ok) {
    return <main id="content"><h1>Database</h1><p className="banner error">{body.error}</p></main>
  }
  return (
    <main id="content">
      <div className="dash-top">
        <div>
          <h1>Database</h1>
          <p className="who">Read only. Connection {body.data.ok ? 'OK' : 'down'} · migration {body.data.migrationVersion}</p>
        </div>
      </div>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead><tr><th>Table</th><th>Rows</th><th></th></tr></thead>
          <tbody>
            {body.data.tables.map((table) => (
              <tr key={table.name}>
                <td className="mono"><Link href={`/admin/database/${table.name}`}>{table.name}</Link></td>
                <td className="num">{table.rows}</td>
                <td><a href={`/admin/export/table?name=${table.name}`}>CSV</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
