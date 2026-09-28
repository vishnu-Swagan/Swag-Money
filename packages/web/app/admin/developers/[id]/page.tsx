import Link from 'next/link'
import { addNote, addTag, setPayoutReviewed, setSuspended } from '../../actions'
import { adminGet, money, when } from '../../lib'
import { ErrorBanner } from '../../widgets'

type Detail = {
  id: string
  name: string
  email: string
  country: string
  signupAt: number
  signupMethod: string
  payoutMethod: string
  tools: string[]
  impressions: number
  verified: number
  earningsCents: number
  balanceCents: number
  lastActiveAt: number
  status: string
  payoutReviewed: boolean
  payoutDestination: string
  notes: Array<{ id: string; body: string; at: number }>
  tags: string[]
  timeline: Array<{ at: number; kind: string; label: string }>
  fraud: {
    served: number
    verified: number
    rejected: number
    expired: number
    viewTooShort: number
    badSignature: number
    replay: number
  }
  payouts: Array<{ id: string; provider: string; mode: string; amountCents: number; destination: string; status: string; at: number }>
}

export default async function DeveloperDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const row = await adminGet<Detail>(`/v1/admin/developers/${id}`)
  const back = `/admin/developers/${id}`
  return (
    <main id="content">
      <p className="kicker"><Link href="/admin/developers">Developers</Link></p>
      <h1>{row.name}</h1>
      <ErrorBanner message={query.error} />
      <p className="who">{row.email} · {row.country || 'No country'} · {row.signupMethod} · signed up {when(row.signupAt)} · last active {when(row.lastActiveAt)}</p>
      <p>
        <span className="badge">{row.status}</span>{' '}
        {row.payoutReviewed ? <span className="badge verified">Payout reviewed</span> : <span className="badge">Payout not reviewed</span>}
      </p>
      <section className="stats">
        <article className="stat"><b>{row.impressions}</b><span>Impressions</span></article>
        <article className="stat"><b>{row.verified}</b><span>Verified</span></article>
        <article className="stat"><b>{money(row.earningsCents)}</b><span>Earnings</span></article>
        <article className="stat"><b>{money(row.balanceCents)}</b><span>Balance</span></article>
      </section>
      <div className="split">
        <section className="panel">
          <h2>Timeline</h2>
          <ul>
            {row.timeline.map((event, index) => (
              <li key={`${event.at}-${index}`}><span className="tiny">{when(event.at)} · {event.kind}</span><br />{event.label}</li>
            ))}
          </ul>
          <h2>Payouts</h2>
          {row.payouts.length === 0 ? <p className="tiny">None yet. Method on file: {row.payoutMethod || 'unset'}.</p> : (
            <table className="admin-table">
              <thead><tr><th>When</th><th>Provider</th><th>Amount</th><th>Destination</th><th>Status</th></tr></thead>
              <tbody>
                {row.payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{when(payout.at)}</td>
                    <td>{payout.provider} · {payout.mode}</td>
                    <td>{money(payout.amountCents)}</td>
                    <td>{payout.destination}</td>
                    <td>{payout.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {row.payoutDestination ? <p className="tiny">Latest destination: {row.payoutDestination}</p> : null}
        </section>
        <section className="panel">
          <h2>Fraud signals</h2>
          <p className="tiny">From render challenges. This is not a hardware attestation.</p>
          <dl className="receipt">
            <dt>Verified</dt><dd>{row.fraud.verified}</dd>
            <dt>Rejected</dt><dd>{row.fraud.rejected}</dd>
            <dt>Expired</dt><dd>{row.fraud.expired}</dd>
            <dt>Too short</dt><dd>{row.fraud.viewTooShort}</dd>
            <dt>Bad signature</dt><dd>{row.fraud.badSignature}</dd>
            <dt>Replay</dt><dd>{row.fraud.replay}</dd>
          </dl>
          <h2>Tags</h2>
          <p>{row.tags.length ? row.tags.map((tag) => <span key={tag} className="badge">{tag} </span>) : <span className="tiny">None</span>}</p>
          <form action={addTag} className="inline">
            <input type="hidden" name="subjectType" value="developer" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <input name="tag" aria-label="Tag" placeholder="Tag" />
            <button className="button secondary" type="submit">Add tag</button>
          </form>
          {row.tags.map((tag) => (
            <form key={tag} action={addTag}>
              <input type="hidden" name="subjectType" value="developer" />
              <input type="hidden" name="subjectId" value={row.id} />
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="tag" value={tag} />
              <input type="hidden" name="remove" value="yes" />
              <button className="text-button" type="submit">Remove {tag}</button>
            </form>
          ))}
          <h2>Note</h2>
          <ul>{row.notes.map((note) => <li key={note.id}><span className="tiny">{when(note.at)}</span><br />{note.body}</li>)}</ul>
          <form action={addNote}>
            <input type="hidden" name="subjectType" value="developer" />
            <input type="hidden" name="subjectId" value={row.id} />
            <input type="hidden" name="back" value={back} />
            <label htmlFor="note">Add a note</label>
            <textarea id="note" name="body" required />
            <button className="button" type="submit">Save note</button>
          </form>
          <h2>Account</h2>
          <p className="tiny">Tools: {row.tools.join(', ') || 'none'}. Google sign-in is not connected, so method stays Email.</p>
          <form action={setSuspended}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="suspended" value={row.status === 'suspended' ? 'no' : 'yes'} />
            <button className="button secondary" type="submit">{row.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>
          </form>
          <form action={setPayoutReviewed}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="reviewed" value={row.payoutReviewed ? 'no' : 'yes'} />
            <button className="button secondary" type="submit">{row.payoutReviewed ? 'Clear payout review' : 'Mark payout reviewed'}</button>
          </form>
        </section>
      </div>
    </main>
  )
}
