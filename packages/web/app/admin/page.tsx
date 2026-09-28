import { apiJson } from '../../lib/api'
import { usd } from '../../lib/admin-format'
import { requireAdmin } from '../../lib/admin'

type Overview = {
  developers: number
  advertisers: number
  signups: { today: number; days7: number; days30: number; days: Array<{ date: string; count: number }> }
  integrations: Array<{ tool: string; active: number }>
  impressionsServed: number
  verifiedViews: number
  advertiserSpendCents: number
  blocksBought: number
  earningsEarnedCents: number
  earningsPaidCents: number
  earningsOwedCents: number
  pendingPayouts: number
  pendingPayoutCents: number
  database: { ok: boolean; migrationVersion: string; tables: Array<{ name: string; rows: number }> }
}

export default async function AdminOverviewPage() {
  await requireAdmin()
  const body = await apiJson<Overview>('/v1/admin/overview')
  if (!body.ok) {
    return (
      <main id="content">
        <h1>Overview</h1>
        <p className="banner error">The ledger is unreachable. {body.error}</p>
      </main>
    )
  }
  const data = body.data
  const peak = Math.max(1, ...data.signups.days.map((day) => day.count))
  return (
    <main id="content">
      <div className="dash-top">
        <div>
          <p className="kicker">Private desk</p>
          <h1>Overview</h1>
        </div>
      </div>
      <section className="stats" aria-label="Totals">
        <article className="stat"><b>{data.developers}</b><span>Developers</span></article>
        <article className="stat"><b>{data.advertisers}</b><span>Advertisers</span></article>
        <article className="stat"><b>{data.signups.today}</b><span>Signups today</span></article>
        <article className="stat"><b>{data.signups.days7}</b><span>Signups, 7 days</span></article>
        <article className="stat"><b>{data.signups.days30}</b><span>Signups, 30 days</span></article>
        <article className="stat"><b>{data.impressionsServed}</b><span>Impressions served</span></article>
        <article className="stat"><b>{data.verifiedViews}</b><span>Verified views</span></article>
        <article className="stat"><b>{usd(data.advertiserSpendCents)}</b><span>Advertiser spend</span></article>
        <article className="stat"><b>{data.blocksBought}</b><span>Blocks bought</span></article>
        <article className="stat"><b>{usd(data.earningsOwedCents)}</b><span>Earnings owed</span></article>
        <article className="stat"><b>{usd(data.earningsPaidCents)}</b><span>Earnings paid</span></article>
        <article className="stat"><b>{data.pendingPayouts}</b><span>Pending payouts · {usd(data.pendingPayoutCents)}</span></article>
      </section>
      <section className="split">
        <article className="panel">
          <h2>Signups</h2>
          <p className="tiny">Last 30 UTC days. Today {data.signups.today}, 7 days {data.signups.days7}, 30 days {data.signups.days30}.</p>
          <div className="chart" role="img" aria-label={`Signups over 30 days, ${data.signups.days30} total`}>
            {data.signups.days.map((day) => (
              <i key={day.date} title={`${day.date}: ${day.count}`} style={{ height: `${Math.max(4, Math.round((day.count / peak) * 100))}%` }} />
            ))}
          </div>
          {data.signups.days30 === 0 ? <p>No signups in the last 30 days.</p> : null}
        </article>
        <article className="panel">
          <h2>Active integrations</h2>
          {data.integrations.length === 0 ? <p>No tool has served an impression yet.</p> : (
            <table className="admin-table">
              <thead><tr><th>Tool</th><th>Installs</th></tr></thead>
              <tbody>
                {data.integrations.map((row) => (
                  <tr key={row.tool}><td>{row.tool}</td><td className="num">{row.active}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Database</h2>
        <p>
          Connection <strong className={data.database.ok ? 'good' : 'bad'}>{data.database.ok ? 'OK' : 'Down'}</strong>
          {' · '}
          Migration <span className="mono">{data.database.migrationVersion}</span>
        </p>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead><tr><th>Table</th><th>Rows</th></tr></thead>
            <tbody>
              {data.database.tables.map((table) => (
                <tr key={table.name}><td className="mono">{table.name}</td><td className="num">{table.rows}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
