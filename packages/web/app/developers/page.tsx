import { formatUsd, PAYOUT_MIN_CENTS } from '@swag-money/shared'
import { DemoSwitch, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'
import { requestPayout } from '../actions'

export const dynamic = 'force-dynamic'

type Summary = {
  user: { name: string; email: string }
  balanceCents: number
  payoutMinCents: number
  verifiedImpressions: number
  rejectedImpressions: number
  pendingImpressions: number
  lifetimeEarnedCents: number
  serverPublicKey: { fingerprint: string; publicKey: string }
  installs: Array<{ id: string; label: string; fingerprint: string }>
  payouts: Array<{
    id: string
    provider: string
    mode: string
    amountCents: number
    creditValueCents: number
    externalId: string
    detail: string
  }>
}

type Impression = {
  id: string
  surface: string
  adText: string
  status: string
  priceCents: number
  developerShareCents: number
  servedAtMs: number
  lastError: string | null
}

export default async function DevelopersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<{ role: string; name: string }>('/v1/me')
  if (!me.ok) {
    return (
      <>
        <SiteNav current="developers" />
        <main id="content" className="wrap gate">
          <p className="kicker">Developers</p>
          <h1>Your half of every verified wait.</h1>
          <p className="dek">{me.error}</p>
          <DemoSwitch />
        </main>
      </>
    )
  }
  if (me.data.role !== 'developer') {
    return (
      <>
        <SiteNav current="developers" signedIn />
        <main id="content" className="wrap gate">
          <h1>This demo user buys ads.</h1>
          <p className="dek">Switch to Ada to see earnings, or open the advertiser desk.</p>
          <DemoSwitch />
        </main>
      </>
    )
  }

  const summary = await apiJson<Summary>('/v1/developer/summary')
  const impressions = await apiJson<{ impressions: Impression[]; total: number }>('/v1/developer/impressions?limit=5')
  if (!summary.ok) {
    return (
      <>
        <SiteNav current="developers" signedIn />
        <main id="content" className="wrap gate"><p>{summary.error}</p></main>
      </>
    )
  }
  if (!impressions.ok) {
    return (
      <>
        <SiteNav current="developers" signedIn />
        <main id="content" className="wrap gate"><p>{impressions.error}</p></main>
      </>
    )
  }
  const data = summary.data
  const ready = data.balanceCents >= data.payoutMinCents

  return (
    <>
      <SiteNav current="developers" signedIn />
      <main id="content" className="wrap">
        <div className="dash-top">
          <div>
            <p className="kicker">Developer ledger</p>
            <h1>{data.user.name}</h1>
            <p className="who">{data.user.email} · payouts open at {formatUsd(data.payoutMinCents)}</p>
          </div>
          <DemoSwitch />
        </div>
        {query.error ? <p className="banner error">{query.error}</p> : null}
        {query.notice ? <p className="banner ok">{noticeCopy(query.notice)}</p> : null}
        <section className="stats">
          <article className="stat"><b>{formatUsd(data.balanceCents)}</b><span>Available balance</span></article>
          <article className="stat"><b>{data.verifiedImpressions}</b><span>Verified impressions</span></article>
          <article className="stat"><b>{data.rejectedImpressions}</b><span>Rejected, not paid</span></article>
          <article className="stat"><b>{formatUsd(data.lifetimeEarnedCents)}</b><span>Lifetime developer share</span></article>
        </section>
        <section className="split">
          <div className="panel">
            <h2>Recent impressions</h2>
            <p className="tiny">{impressions.data.total} total · {data.pendingImpressions} still inside the render window · showing the latest {impressions.data.impressions.length}</p>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Surface</th>
                  <th>Line</th>
                  <th>Status</th>
                  <th>Your half</th>
                </tr>
              </thead>
              <tbody>
                {impressions.data.impressions.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{stamp(row.servedAtMs)}</td>
                    <td className="mono">{row.surface}</td>
                    <td>{row.adText}</td>
                    <td>
                      <span className={`badge ${row.status}`}>{row.status}</span>
                      {row.lastError ? <div className="tiny">{row.lastError}</div> : null}
                    </td>
                    <td className="num">{row.status === 'verified' ? formatUsd(row.developerShareCents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <section className="panel">
              <h2>Request a payout</h2>
              <p className="tiny">Minimum {formatUsd(PAYOUT_MIN_CENTS)}. API credits add 10%. Stripe, Solana, and Lightning receipts are mock or sandbox and do not leave this machine.</p>
              <form action={requestPayout}>
                <label htmlFor="amount">Amount in dollars</label>
                <input id="amount" name="amount" defaultValue={ready ? (data.balanceCents / 100).toFixed(2) : '10.00'} />
                <label htmlFor="provider">Rail</label>
                <select id="provider" name="provider" defaultValue="api_credits">
                  <option value="api_credits">API credits, 10% bonus</option>
                  <option value="stripe_connect">Stripe Connect</option>
                  <option value="solana">Solana</option>
                  <option value="lightning">Lightning</option>
                </select>
                <label htmlFor="destination">Destination</label>
                <input id="destination" name="destination" defaultValue="anthropic" />
                <p className="tiny">Use acct_12345678, a Solana address, a Lightning address, or anthropic / openai / oss.</p>
                <button className="button" type="submit" disabled={!ready}>
                  {ready ? 'Request payout' : `Need ${formatUsd(data.payoutMinCents - data.balanceCents)} more`}
                </button>
              </form>
              {data.payouts.length > 0 ? (
                <ul>
                  {data.payouts.map((payout) => (
                    <li key={payout.id}>
                      <span className="mono">{payout.mode}</span> {payout.provider} {formatUsd(payout.amountCents)}
                      {payout.provider === 'api_credits' ? ` → ${formatUsd(payout.creditValueCents)} credit` : ''} · {payout.externalId}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2>Install the client</h2>
              <p className="tiny">Pin this server key. Do not trust a key that arrives inside an ad.</p>
              <p className="mono">Fingerprint {data.serverPublicKey.fingerprint}</p>
              <pre className="code">{`pnpm --filter @swag-money/claude-code demo`}</pre>
              <p className="tiny">The demo registers a device, writes a temp Claude Code settings file, holds the signed line for 5 seconds, verifies, and restores the original bytes.</p>
              {data.installs.length > 0 ? (
                <ul>
                  {data.installs.map((install) => (
                    <li key={install.id}><span className="mono">{install.label}</span> · {install.fingerprint}</li>
                  ))}
                </ul>
              ) : <p className="tiny">No device registered yet.</p>}
            </section>
          </div>
        </section>
      </main>
    </>
  )
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ')
}

function noticeCopy(notice: string): string {
  if (notice.startsWith('credits-')) {
    const cents = Number(notice.slice('credits-'.length))
    return `Payout recorded. API credits issued locally at ${formatUsd(cents)}, including the 10% bonus. No provider was called.`
  }
  if (notice === 'sandbox' || notice === 'mock') {
    return `Payout recorded in ${notice} mode. No payment network was contacted.`
  }
  return 'Payout recorded.'
}
