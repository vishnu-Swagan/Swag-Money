import Link from 'next/link'
import { adminGet } from '../lib'

type Index = { tables: Array<{ name: string; title: string; count: number }>; migrationVersion: string }

export default async function DatabasePage() {
  const data = await adminGet<Index>('/v1/admin/database')
  return (
    <main id="content">
      <p className="kicker">Read only</p>
      <h1>Database</h1>
      <p className="sub">Migration {data.migrationVersion}. Password hashes, API key hashes, device keys, and magic-link tokens are not in this browser. There is no SQL box.</p>
      <div className="panel">
        <table className="admin-table">
          <thead><tr><th>Table</th><th>Rows</th></tr></thead>
          <tbody>
            {data.tables.map((table) => (
              <tr key={table.name}>
                <td><Link href={`/admin/database/${table.name}`}>{table.title}</Link></td>
                <td className="num">{table.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
