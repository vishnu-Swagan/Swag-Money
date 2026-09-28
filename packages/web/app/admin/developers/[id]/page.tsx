import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addNote, addTag, removeTag, reviewPayout, setDeveloperStatus } from '../../actions'
import { requireAdmin } from '../../../../lib/admin'
import { apiJson } from '../../../../lib/api'
import { usd, when } from '../../../../lib/admin-format'

type Detail = {
  id: string
  name: string
  email: string
  country: string
  createdAtMs: number
  signupMethod: string
  payoutMethod: string
  tools: string[]
  impressions: number
  earningsCents: number
  balanceCents: number
  lastActiveMs: number | null
  status: string
  tags: string[]
  notes: Array<{ id: string; body: string; createdAtMs: number }>
  payouts: Array<{ id: string; provider: string; amountCents: number; status: string; destination: string; reviewedAtMs: number | null; createdAtMs: number; detail: string }>
  fraud: { rejected: number; expired: number; byReason: Record<string, number>; recent: Array<{ id: string; at: number; surface: string; status: string; reason: string | null }> }
  timeline: Array<{ at: number; kind: string; label: string; detail: string }>
}

export default async function DeveloperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const query = await searchParams
  const body = await apiJson<Detail>(`/v1/admin/developers/${id}`)
  if (!body.ok) notFound()
  const row = body.data
  const back = `/admin/developers/${id}`
  return (
    <main id="content">
      <p className="tiny"><Link href="/admin/developers">Developers</Link></p>
      <div className="dash-top">
        <div>
          <h1>{row.name}</h1>
          <p className="who">{row.email} · {row.country || 'No country'} · {row.signupMethod || 'unknown signup'} · {row.payoutMethod || 'no payout method'}</p>
        </div>
        <form action={setDeveloperStatus}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value={row.status === 'suspended' ? 'active' : 'suspended'} />
          <button className="button secondary" type="submit">{row.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>
        </form>
      </div>
      {query.error ? <p className="banner error">{query.error}</p> : null}
      {query.notice ? <p className="banner ok">Saved.</p> : null}
      <section className="stats">
        <article className="stat"><b>{row.impressions}</b><span>Impressions</span></article>
        <article className="stat"><b>{usd(row.earningsCents)}</b><span>Earned</span></article>
        <article className="stat"><b>{usd(row.balanceCents)}</b><span>Balance</span></article>
        <article className="stat"><b>{when(row.lastActiveMs)}</b><span>Last active</span></article>
      </section>
      <div className="split">
        <section className="panel">
          <h2>Timeline</h2>
          {row.timeline.length === 0 ? <p>No events yet.</p> : (
            <ol className="timeline">
              {row.timeline.map((event, index) => (
                <li key={`${event.kind}-${event.at}-${index}`}>
                  <span className="mono tiny">{when(event.at)}</span>
                  <strong>{event.label}</strong>
                  <span>{event.detail}</span>
                </li>
              ))}
            </ol>
          )}
          <h2>Fraud signals</h2>
          <p>{row.fraud.rejected} rejected · {row.fraud.expired} expired</p>
          {Object.keys(row.fraud.byReason).length === 0 ? <p>No failed render challenges.</p> : (
            <ul>
              {Object.entries(row.fraud.byReason).map(([reason, count]) => (
                <li key={reason}><span className="mono">{reason}</span> · {count}</li>
              ))}
            </ul>
          )}
          {row.fraud.recent.length > 0 ? (
            <table className="admin-table">
              <thead><tr><th>When</th><th>Surface</th><th>Status</th><th>Reason</th></tr></thead>
              <tbody>
                {row.fraud.recent.map((item) => (
                  <tr key={item.id}>
                    <td className="mono">{when(item.at)}</td>
                    <td>{item.surface}</td>
                    <td>{item.status}</td>
                    <td>{item.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
        <section className="panel">
          <h2>Tags</h2>
          <div className="inline">
            {row.tags.length === 0 ? <span className="tiny">No tags.</span> : row.tags.map((tag) => (
              <form key={tag} action={removeTag}>
                <input type="hidden" name="subjectType" value="developer" />
                <input type="hidden" name="subjectId" value={row.id} />
                <input type="hidden" name="tag" value={tag} />
                <input type="hidden" name="back" value={back} />
                <button className="badge" type="submit">{tag} ×</button>
              </form>
            ))}
          </div>
          <form action={addTag}>
            <input type="hidden" name="subjectType" value="developer" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="dev-tag">Add tag</label>
            <input id="dev-tag" name="tag" placeholder="fraud-review" />
            <button className="button secondary" type="submit">Add tag</button>
          </form>
          <h2>Notes</h2>
          {row.notes.length === 0 ? <p>No notes.</p> : row.notes.map((note) => (
            <p key={note.id}><span className="tiny mono">{when(note.createdAtMs)}</span><br />{note.body}</p>
          ))}
          <form action={addNote}>
            <input type="hidden" name="subjectType" value="developer" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="dev-note">Add note</label>
            <textarea id="dev-note" name="body" required maxLength={2000} />
            <button className="button" type="submit">Save note</button>
          </form>
        </section>
      </div>
      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Payouts</h2>
        <p className="tiny">Full destination is shown on this page only. Lists mask it.</p>
        {row.payouts.length === 0 ? <p>No payouts.</p> : (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead><tr><th>When</th><th>Provider</th><th>Amount</th><th>Status</th><th>Destination</th><th>Reviewed</th><th></th></tr></thead>
              <tbody>
                {row.payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="mono">{when(payout.createdAtMs)}</td>
                    <td>{payout.provider}</td>
                    <td className="num">{usd(payout.amountCents)}</td>
                    <td>{payout.status}</td>
                    <td className="mono">{payout.destination}</td>
                    <td>{payout.reviewedAtMs ? when(payout.reviewedAtMs) : 'No'}</td>
                    <td>
                      {payout.reviewedAtMs ? null : (
                        <form action={reviewPayout}>
                          <input type="hidden" name="id" value={payout.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="button secondary" type="submit">Mark reviewed</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
