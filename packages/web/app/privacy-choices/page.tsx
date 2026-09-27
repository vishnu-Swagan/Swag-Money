import { SiteFooter, SiteNav } from '../../components/nav'
import { privacyChoice } from '../actions'

export default async function PrivacyChoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const query = await searchParams
  return (
    <>
      <SiteNav />
      <main id="content" className="wrap gate">
        <p className="kicker">Privacy choices</p>
        <h1>Access, correction, deletion.</h1>
        <p className="dek">
          This form does not store what you type. Submitting it only confirms that a production deployment would have to honor the request. In this demo, delete the local <span className="mono">data/</span> directory to erase the ledger.
        </p>
        {query.notice === 'received' ? <p className="banner ok">Nothing was saved. The fields were discarded on the server.</p> : null}
        <form className="panel" action={privacyChoice}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
          <label htmlFor="kind">Request</label>
          <select id="kind" name="kind" defaultValue="delete">
            <option value="access">Access</option>
            <option value="correct">Correct</option>
            <option value="delete">Delete</option>
            <option value="do-not-sell">Do not sell or share</option>
          </select>
          <button className="button" type="submit">Submit without storing</button>
        </form>
      </main>
      <SiteFooter />
    </>
  )
}
