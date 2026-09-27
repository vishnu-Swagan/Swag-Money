import { TOOLS } from '@swag-money/shared'
import Link from 'next/link'
import { SiteFooter, SiteNav } from '../../components/nav'
import { apiJson } from '../../lib/api'
import { checkoutBlocks } from '../actions'

const COUNTRIES = ['US', 'IN', 'GB', 'DE', 'FR', 'CA', 'BR', 'NG', 'JP', 'AU', 'SG', 'NL', 'MX', 'ID', 'KE']

export const dynamic = 'force-dynamic'

export default async function AdvertisePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const query = await searchParams
  const me = await apiJson<{ role: string; name: string }>('/v1/me')
  const signedIn = me.ok
  const sellable = TOOLS.filter((tool) => tool.sellable)
  if (me.ok && me.data.role !== 'advertiser') {
    return (
      <>
        <SiteNav current="advertise" signedIn />
        <main id="content" className="wrap gate">
          <h1>This account earns, it does not buy.</h1>
          <p className="dek">Sign in as an advertiser to purchase impression blocks.</p>
          <p><Link href="/login">Log in</Link></p>
        </main>
        <SiteFooter />
      </>
    )
  }
  return (
    <>
      <SiteNav current="advertise" signedIn={signedIn} />
      <main id="content" className="wrap page-pad">
        <p className="kicker">Advertisers</p>
        <h1>Buy a block. Bid in the auction.</h1>
        <p className="dek">
          A block is 1,000 impression credits. Minimum bid $0.50. Checkout here is a mock card charge: the budget lands in the English auction and no payment network is called. You pay the clearing price per verified impression, never more than your max, until the budget or the credits run out.
        </p>
        {query.error ? <p className="banner error">{query.error}</p> : null}
        <form className="panel" action={checkoutBlocks}>
          {!signedIn ? (
            <>
              <h2>Account</h2>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
              <label htmlFor="personName">Your name</label>
              <input id="personName" name="personName" required maxLength={60} />
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required minLength={8} />
            </>
          ) : (
            <p className="tiny">Signed in as {me.data.name}. This buy is attached to that account.</p>
          )}
          <h2>Creative</h2>
          <label htmlFor="name">Campaign name</label>
          <input id="name" name="name" required maxLength={60} defaultValue="Northwind block" />
          <label htmlFor="advertiserName">Brand</label>
          <input id="advertiserName" name="advertiserName" required maxLength={40} defaultValue="Northwind" />
          <label htmlFor="text">Ad line</label>
          <textarea id="text" name="text" required maxLength={80} defaultValue="Northwind CI: ephemeral environments for every PR" />
          <label htmlFor="destinationUrl">Destination URL</label>
          <input id="destinationUrl" name="destinationUrl" type="url" required defaultValue="https://northwind.example/ci" />
          <p className="tiny">Stored for you. It is not placed in the signed payload the developer’s client verifies.</p>
          <h2>Buy</h2>
          <label htmlFor="blocks">Blocks (1,000 impressions each)</label>
          <input id="blocks" name="blocks" type="number" min={1} max={100} required defaultValue={1} />
          <label htmlFor="bid">Bid per block (USD)</label>
          <input id="bid" name="bid" required defaultValue="2.00" />
          <label htmlFor="placement">Placement</label>
          <select id="placement" name="placement" defaultValue="terminal">
            <option value="terminal">Terminal</option>
            <option value="editor">Editor</option>
            <option value="browser">Browser</option>
            <option value="any">Any placement I check below</option>
          </select>
          <p className="tiny">If you leave the tool list empty, the placement you picked fills in its sellable tools.</p>
          <label>Tools</label>
          <div className="checks">
            {sellable.map((tool) => (
              <label key={tool.id}>
                <input type="checkbox" name="tools" value={tool.surface} />
                {tool.name} <span className={`badge ${tool.status}`}>{tool.status}</span>
              </label>
            ))}
          </div>
          <label>Countries (optional, up to 20, +$0.75 per block)</label>
          <div className="checks">
            {COUNTRIES.map((code) => (
              <label key={code}>
                <input type="checkbox" name="countries" value={code} />
                {code}
              </label>
            ))}
          </div>
          <p className="tiny">
            Scaffold tools accept a buy and will not deliver until that adapter runs. <Link href="/surface-pricing">How placement pricing works.</Link>
          </p>
          <button className="button" type="submit">Pay with mock card</button>
        </form>
      </main>
      <SiteFooter />
    </>
  )
}
