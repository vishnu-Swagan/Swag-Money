import { adminGet, money } from './lib'
import { SignupChart, Stat } from './widgets'

type Overview = {
  developers: number
  advertisers: number
  signups: {
    today: { developers: number; advertisers: number }
    days7: { developers: number; advertisers: number }
    days30: { developers: number; advertisers: number }
    series: Array<{ day: string; developers: number; advertisers: number }>
  }
  integrations: Array<{ tool: string; count: number }>
  impressionsServed: number
  verifiedViews: number
  advertiserSpendCents: number
  developerEarningsCents: number
  developerPaidCents: number
  developerOwedCents: number
  pendingPayouts: number
  database: {
    connection: string
    migrationVersion: string
    bytes: number | null
    tables: Array<{ name: string; count: number }>
  }
}

export default async function AdminHome() {
  const data = await adminGet<Overview>('/v1/admin/overview')
  const size = data.database.bytes === null ? 'unavailable' : `${(data.database.bytes / (1024 * 1024)).toFixed(1)} MB`
  return (
    <main id="content">
      <p className="kicker">CRM</p>
      <h1>Overview</h1>
      <section className="stats" aria-label="Totals">
        <Stat value={data.developers} label="Developers" />
        <Stat value={data.advertisers} label="Advertisers" />
        <Stat value={data.impressionsServed} label="Impressions served" />
        <Stat value={data.verifiedViews} label="Verified views" />
        <Stat value={money(data.advertiserSpendCents)} label="Advertiser spend" />
        <Stat value={money(data.developerEarningsCents)} label="Developer earnings" />
        <Stat value={money(data.developerOwedCents)} label="Balance owed" />
        <Stat value={money(data.developerPaidCents)} label="Paid out" />
        <Stat value={data.pendingPayouts} label="Pending payouts" />
      </section>
      <section className="band">
        <h2>Signups</h2>
        <div className="stats">
          <Stat value={data.signups.today.developers + data.signups.today.advertisers} label="Today" />
          <Stat value={data.signups.days7.developers + data.signups.days7.advertisers} label="Last 7 days" />
          <Stat value={data.signups.days30.developers + data.signups.days30.advertisers} label="Last 30 days" />
        </div>
        <SignupChart series={data.signups.series} />
      </section>
      <section className="split">
        <div className="panel">
          <h2>Integrations</h2>
          {data.integrations.length === 0 ? <p className="tiny">No installs yet.</p> : (
            <table className="admin-table">
              <thead><tr><th>Tool</th><th>Installs</th></tr></thead>
              <tbody>
                {data.integrations.map((row) => (
                  <tr key={row.tool}><td>{row.tool}</td><td className="num">{row.count}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>Database</h2>
          <p className={data.database.connection === 'ok' ? 'good' : 'bad'}>Connection {data.database.connection}</p>
          <p className="tiny">Migration {data.database.migrationVersion} · size {size}</p>
          <table className="admin-table">
            <tbody>
              {data.database.tables.map((table) => (
                <tr key={table.name}><td>{table.name}</td><td className="num">{table.count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
